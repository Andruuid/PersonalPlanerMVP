/**
 * Booking & account-balance core: pure, DB-bound business logic.
 *
 * This module is intentionally decoupled from Next.js, auth, audit logging,
 * and cache revalidation. Every public function takes a `PrismaClient` as
 * its first parameter so it can be exercised against any libsql/sqlite
 * database (production or in-memory test fixtures).
 *
 * Server-side wrappers in `server/bookings.ts` add auth, Zod validation,
 * audit-log writes, and `revalidatePath` calls on top of this layer.
 */

import { addDays } from "date-fns";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  computeWeeklyBalance,
  type PlanEntryByDate,
} from "@/lib/time/balance";
import { effectiveStandardWorkDays } from "@/lib/time/soll";
import { buildHolidayLookup } from "@/lib/time/holidays";
import { isoDateString, isoWeekDays } from "@/lib/time/week";
import { hasRestWindowMinutes, type TimeInterval } from "@/lib/time/ert";
import { planYearRollover } from "@/lib/time/year-rollover";
import type {
  AccountType,
  AccountUnit,
  BookingType,
} from "@/lib/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

export const ACCOUNT_UNITS: Record<AccountType, AccountUnit> = {
  ZEITSALDO: "MINUTES",
  FERIEN: "DAYS",
  UEZ: "MINUTES",
  TZT: "DAYS",
  SONNTAG_FEIERTAG_KOMPENSATION: "MINUTES",
  PARENTAL_CARE: "DAYS",
};

const ACCOUNT_TYPES: AccountType[] = [
  "ZEITSALDO",
  "FERIEN",
  "UEZ",
  "TZT",
  "SONNTAG_FEIERTAG_KOMPENSATION",
  "PARENTAL_CARE",
];

/** Prisma default interactive-tx timeout is 5s; week close / carryover can exceed that. */
const HEAVY_INTERACTIVE_TX: { timeout: number; maxWait: number } = {
  timeout: 30_000,
  maxWait: 10_000,
};
const ERT_MIN_REST_MINUTES = 35 * 60;

function dateAtMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseHourMinute(raw: string | null | undefined): { h: number; m: number } | null {
  if (!raw) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  return { h: Number(m[1]), m: Number(m[2]) };
}

function intervalFromTimedEntry(entry: {
  date: Date;
  plannedMinutes: number;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  serviceTemplate: { startTime: string; endTime: string } | null;
}): TimeInterval | null {
  if (entry.plannedMinutes <= 0) return null;

  const startRaw = entry.oneTimeStart ?? entry.serviceTemplate?.startTime ?? "08:00";
  const startHm = parseHourMinute(startRaw);
  if (!startHm) return null;

  const day = dateAtMidnight(entry.date);
  const start = new Date(day);
  start.setHours(startHm.h, startHm.m, 0, 0);

  const endRaw = entry.oneTimeEnd ?? entry.serviceTemplate?.endTime ?? null;
  const endHm = parseHourMinute(endRaw);
  let end: Date;
  if (endHm) {
    end = new Date(day);
    end.setHours(endHm.h, endHm.m, 0, 0);
    if (end <= start) {
      end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }
  } else {
    end = new Date(start.getTime() + entry.plannedMinutes * 60_000);
  }

  return end > start ? { start, end } : null;
}

export async function computeErtFulfilled(
  tx: Tx,
  employeeId: string,
  triggerDate: Date,
  dueAt: Date,
): Promise<boolean> {
  const windowStart = addDays(dateAtMidnight(triggerDate), 1);
  const windowEnd = addDays(dateAtMidnight(dueAt), 1);
  if (windowEnd <= windowStart) return false;

  const rows = await tx.planEntry.findMany({
    where: {
      employeeId,
      deletedAt: null,
      date: { gte: windowStart, lt: windowEnd },
      kind: { in: ["SHIFT", "ONE_TIME_SHIFT"] },
      plannedMinutes: { gt: 0 },
    },
    select: {
      date: true,
      plannedMinutes: true,
      oneTimeStart: true,
      oneTimeEnd: true,
      serviceTemplate: { select: { startTime: true, endTime: true } },
    },
  });

  const intervals = rows
    .map((r) => intervalFromTimedEntry(r))
    .filter((r): r is TimeInterval => r !== null);

  return hasRestWindowMinutes(
    intervals,
    windowStart,
    windowEnd,
    ERT_MIN_REST_MINUTES,
  );
}

export async function upsertAndAdvanceErtCases(
  tx: Tx,
  employeeId: string,
  tenantId: string,
  weekDays: Array<{ iso: string; kind: string; plannedMinutes: number }>,
  referenceDate: Date,
): Promise<void> {
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { ertDueDays: true },
  });
  const dueOffsetDays = tenant.ertDueDays;

  for (const day of weekDays) {
    if (day.kind !== "HOLIDAY_WORK" || day.plannedMinutes <= 300) continue;
    const triggerDate = new Date(`${day.iso}T00:00:00`);
    await tx.ertCase.upsert({
      where: { employeeId_triggerDate: { employeeId, triggerDate } },
      create: {
        tenantId,
        employeeId,
        triggerDate,
        holidayWorkMinutes: day.plannedMinutes,
        status: "OPEN",
        dueAt: addDays(triggerDate, dueOffsetDays),
      },
      update: {
        holidayWorkMinutes: day.plannedMinutes,
        dueAt: addDays(triggerDate, dueOffsetDays),
      },
    });
  }

  const openCases = await tx.ertCase.findMany({
    where: {
      employeeId,
      status: { in: ["OPEN", "OVERDUE"] },
    },
  });
  for (const ert of openCases) {
    const fulfilled = await computeErtFulfilled(
      tx,
      employeeId,
      ert.triggerDate,
      ert.dueAt,
    );
    if (fulfilled) {
      await tx.ertCase.update({
        where: { id: ert.id },
        data: { status: "FULFILLED", fulfilledAt: new Date(referenceDate) },
      });
      continue;
    }
    const isOverdue = referenceDate > ert.dueAt;
    await tx.ertCase.update({
      where: { id: ert.id },
      data: {
        status: isOverdue ? "OVERDUE" : "OPEN",
        fulfilledAt: null,
      },
    });
  }
}

async function sumCompensationRedemptionMinutesSince(
  tx: Tx,
  employeeId: string,
  triggerDate: Date,
): Promise<number> {
  const agg = await tx.booking.aggregate({
    where: {
      employeeId,
      bookingType: "COMPENSATION_REDEMPTION",
      accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
      date: { gte: dateAtMidnight(triggerDate) },
    },
    _sum: { value: true },
  });
  const sum = agg._sum.value ?? 0;
  return sum < 0 ? -sum : 0;
}

async function upsertAndAdvanceCompensationCases(
  tx: Tx,
  employeeId: string,
  tenantId: string,
  weekDays: Array<{ iso: string; kind: string; plannedMinutes: number }>,
  referenceDate: Date,
  vacationDaysPerYear: number,
  createdByUserId: string,
): Promise<void> {
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { compensationDueDays: true },
  });
  const dueOffsetDays = tenant.compensationDueDays;

  for (const day of weekDays) {
    if (day.kind !== "HOLIDAY_WORK") continue;
    if (day.plannedMinutes <= 0 || day.plannedMinutes > 300) continue;
    const triggerDate = new Date(`${day.iso}T00:00:00`);
    await tx.compensationCase.upsert({
      where: { employeeId_triggerDate: { employeeId, triggerDate } },
      create: {
        tenantId,
        employeeId,
        triggerDate,
        holidayWorkMinutes: day.plannedMinutes,
        status: "OPEN",
        dueAt: addDays(triggerDate, dueOffsetDays),
      },
      update: {
        holidayWorkMinutes: day.plannedMinutes,
        dueAt: addDays(triggerDate, dueOffsetDays),
      },
    });
  }

  const openCases = await tx.compensationCase.findMany({
    where: { employeeId, status: "OPEN" },
  });
  for (const c of openCases) {
    const redeemed = await sumCompensationRedemptionMinutesSince(
      tx,
      employeeId,
      c.triggerDate,
    );
    if (redeemed >= c.holidayWorkMinutes) {
      await tx.compensationCase.update({
        where: { id: c.id },
        data: { status: "REDEEMED", redeemedAt: referenceDate },
      });
      continue;
    }
    if (referenceDate > c.dueAt) {
      const expiredMarker = `COMPENSATION_EXPIRED_CASE:${c.id}`;
      const existingExpired = await tx.booking.findFirst({
        where: {
          employeeId,
          bookingType: "COMPENSATION_EXPIRED",
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          comment: { contains: expiredMarker },
        },
      });
      const remainingMinutes = c.holidayWorkMinutes - redeemed;
      if (!existingExpired && remainingMinutes > 0) {
        const year = referenceDate.getFullYear();
        await ensureBalanceRow(
          tx,
          employeeId,
          tenantId,
          "SONNTAG_FEIERTAG_KOMPENSATION",
          year,
          vacationDaysPerYear,
        );
        await tx.booking.create({
          data: {
            tenantId,
            employeeId,
            accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
            date: referenceDate,
            value: -remainingMinutes,
            bookingType: "COMPENSATION_EXPIRED",
            comment: `Verfall Sonn-/Feiertagskompensation (${remainingMinutes} Min.)\n${expiredMarker}`,
            createdByUserId,
          },
        });
        await recomputeBalance(
          tx,
          employeeId,
          "SONNTAG_FEIERTAG_KOMPENSATION",
          year,
        );
      }
      await tx.compensationCase.update({
        where: { id: c.id },
        data: { status: "EXPIRED" },
      });
    }
  }
}

function isEmployeeActiveOnDate(
  employee: { entryDate: Date; exitDate: Date | null },
  referenceDate: Date,
): boolean {
  if (employee.entryDate > referenceDate) return false;
  if (employee.exitDate && employee.exitDate < referenceDate) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Internal helpers (transaction-scoped)
// ---------------------------------------------------------------------------

/**
 * Ensure an `AccountBalance` row exists for (employee, accountType, year).
 * For FERIEN we seed openingValue from `vacationDaysPerYear` so even before
 * any bookings the new year shows the full allowance. All other accounts
 * open at 0.
 */
async function ensureBalanceRow(
  tx: Tx,
  employeeId: string,
  tenantId: string,
  accountType: AccountType,
  year: number,
  vacationDaysPerYear: number,
): Promise<void> {
  const existing = await tx.accountBalance.findUnique({
    where: { employeeId_accountType_year: { employeeId, accountType, year } },
  });
  if (existing) return;

  const opening = accountType === "FERIEN" ? vacationDaysPerYear : 0;
  await tx.accountBalance.create({
    data: {
      tenantId,
      employeeId,
      accountType,
      year,
      openingValue: opening,
      currentValue: opening,
      unit: ACCOUNT_UNITS[accountType],
    },
  });
}

/**
 * Recompute currentValue = openingValue + sum(non-OPENING bookings.value) for one row.
 *
 * OPENING bookings are explicitly excluded from this sum because their
 * effect is folded into AccountBalance.openingValue at the time the OPENING
 * booking is written (see applyEmployeeOpeningBalances and applyManualBooking
 * with bookingType=OPENING). Including them here would double-count.
 */
async function recomputeBalance(
  tx: Tx,
  employeeId: string,
  accountType: AccountType,
  year: number,
): Promise<void> {
  const row = await tx.accountBalance.findUnique({
    where: { employeeId_accountType_year: { employeeId, accountType, year } },
  });
  if (!row) return;

  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const bookings = await tx.booking.findMany({
    where: {
      employeeId,
      accountType,
      date: { gte: start, lt: end },
      bookingType: { not: "OPENING" },
    },
    select: { value: true },
  });
  const sum = bookings.reduce((acc, b) => acc + b.value, 0);
  await tx.accountBalance.update({
    where: { id: row.id },
    data: { currentValue: row.openingValue + sum },
  });
}

export interface EmployeeOpeningBalancesInput {
  employeeId: string;
  tenantId: string;
  vacationDaysPerYear: number;
  entryDate: Date;
  createdByUserId: string;
  /** Per account: non-zero values post one OPENING booking (unit = account unit). */
  openings: Partial<Record<AccountType, number>>;
}

/**
 * Create OPENING bookings for initial balances (e.g. from employee onboarding).
 * Idempotent per account only in the sense that the caller should run once at hire;
 * duplicate calls would add duplicate openings.
 */
export async function applyEmployeeOpeningBalances(
  tx: Tx,
  input: EmployeeOpeningBalancesInput,
): Promise<number> {
  const year = input.entryDate.getFullYear();
  let created = 0;
  for (const accountType of ACCOUNT_TYPES) {
    const value = input.openings[accountType];
    if (value === undefined || value === null || value === 0) continue;
    await ensureBalanceRow(
      tx,
      input.employeeId,
      input.tenantId,
      accountType,
      year,
      input.vacationDaysPerYear,
    );
    await tx.booking.create({
      data: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        accountType,
        date: input.entryDate,
        value,
        bookingType: "OPENING",
        comment: "Anfangsbestand (Stammdaten)",
        createdByUserId: input.createdByUserId,
      },
    });
    await tx.accountBalance.update({
      where: {
        employeeId_accountType_year: {
          employeeId: input.employeeId,
          accountType,
          year,
        },
      },
      data: { openingValue: { increment: value } },
    });
    await recomputeBalance(tx, input.employeeId, accountType, year);
    created += 1;
  }
  return created;
}

// ---------------------------------------------------------------------------
// Week close / reopen
// ---------------------------------------------------------------------------

export interface RecalcWeekCloseResult {
  weekId: string;
  year: number;
  weekNumber: number;
  employeesAffected: number;
  bookingsCreated: number;
}

/**
 * Idempotently recompute all week-close generated bookings for one closed week.
 *
 * - Drops any prior week-close bookings (AUTO_WEEKLY / FREE_REQUESTED /
 *   UEZ_REDEMPTION) dated within Mo–So of the week.
 *   within Mo–So of the week.
 * - Computes new bookings for Zeitsaldo, Ferien, UEZ contributions per
 *   active employee using the pure Zeitlogik.
 * - Posts them dated to Sunday of the week.
 * - Recomputes affected AccountBalance.currentValue rows.
 *
 * Caller is responsible for setting Week.status = CLOSED.
 */
export async function recalcWeekClose(
  prisma: PrismaClient,
  weekId: string,
  closedByUserId: string,
): Promise<RecalcWeekCloseResult> {
  const week = await prisma.week.findFirst({
    where: { id: weekId, deletedAt: null },
  });
  if (!week) {
    return {
      weekId,
      year: 0,
      weekNumber: 0,
      employeesAffected: 0,
      bookingsCreated: 0,
    };
  }

  const tenantId = week.tenantId;
  const days = isoWeekDays(week.year, week.weekNumber);
  const monday = days[0].date;
  const sunday = days[6].date;
  const yearForBookings = sunday.getFullYear();

  const employees = (
    await prisma.employee.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      include: {
        tenant: { select: { defaultStandardWorkDays: true } },
      },
    })
  ).filter((employee) => isEmployeeActiveOnDate(employee, sunday));

  const planEntries = await prisma.planEntry.findMany({
    where: { weekId, deletedAt: null, employee: { tenantId } },
    include: {
      serviceTemplate: { select: { startTime: true, endTime: true } },
    },
  });

  const streakPrefetch = await prisma.planEntry.findMany({
    where: {
      deletedAt: null,
      date: {
        gte: addDays(monday, -14),
        lt: monday,
      },
      employee: { tenantId },
    },
    include: {
      serviceTemplate: { select: { startTime: true, endTime: true } },
    },
  });

  const streakPrefetchByEmp = new Map<string, PlanEntryByDate[]>();
  for (const e of streakPrefetch) {
    const list = streakPrefetchByEmp.get(e.employeeId) ?? [];
    list.push({
      date: isoDateString(e.date),
      kind: e.kind,
      absenceType: e.absenceType ?? null,
      plannedMinutes: e.plannedMinutes,
      shiftStartTime:
        e.kind === "SHIFT" && e.serviceTemplate
          ? e.serviceTemplate.startTime
          : e.kind === "ONE_TIME_SHIFT"
            ? e.oneTimeStart
            : null,
      shiftEndTime:
        e.kind === "SHIFT" && e.serviceTemplate
          ? e.serviceTemplate.endTime
          : e.kind === "ONE_TIME_SHIFT"
            ? e.oneTimeEnd
            : null,
    });
    streakPrefetchByEmp.set(e.employeeId, list);
  }

  const locationIds = Array.from(new Set(employees.map((e) => e.locationId)));
  const holidayRows = await prisma.holiday.findMany({
    where: {
      tenantId,
      locationId: { in: locationIds },
      date: {
        gte: new Date(week.year - 1, 11, 1),
        lt: new Date(week.year + 1, 1, 1),
      },
    },
  });
  const holidaysByLocation = new Map<
    string,
    ReturnType<typeof buildHolidayLookup>
  >();
  for (const locId of locationIds) {
    holidaysByLocation.set(
      locId,
      buildHolidayLookup(
        holidayRows
          .filter((h) => h.locationId === locId)
          .map((h) => ({ date: h.date, name: h.name })),
      ),
    );
  }

  const planEntriesByEmployee = new Map<string, PlanEntryByDate[]>();
  for (const e of planEntries) {
    const list = planEntriesByEmployee.get(e.employeeId) ?? [];
    list.push({
      date: isoDateString(e.date),
      kind: e.kind,
      absenceType: e.absenceType ?? null,
      plannedMinutes: e.plannedMinutes,
      shiftStartTime:
        e.kind === "SHIFT" && e.serviceTemplate
          ? e.serviceTemplate.startTime
          : e.kind === "ONE_TIME_SHIFT"
            ? e.oneTimeStart
            : null,
      shiftEndTime:
        e.kind === "SHIFT" && e.serviceTemplate
          ? e.serviceTemplate.endTime
          : e.kind === "ONE_TIME_SHIFT"
            ? e.oneTimeEnd
            : null,
    });
    planEntriesByEmployee.set(e.employeeId, list);
  }

  let employeesAffected = 0;
  let bookingsCreated = 0;

  await prisma.$transaction(async (tx) => {
    const weekStart = monday;
    const weekEndExclusive = addDays(sunday, 1);

    const priorWeekCloseBookings = await tx.booking.findMany({
      where: {
        tenantId,
        bookingType: { in: ["AUTO_WEEKLY", "FREE_REQUESTED", "UEZ_REDEMPTION"] },
        date: { gte: weekStart, lt: weekEndExclusive },
      },
      select: { id: true, employeeId: true, accountType: true },
    });
    const touchedFromPrior = new Map<string, Set<AccountType>>();
    for (const b of priorWeekCloseBookings) {
      const set = touchedFromPrior.get(b.employeeId) ?? new Set<AccountType>();
      set.add(b.accountType as AccountType);
      touchedFromPrior.set(b.employeeId, set);
    }
    if (priorWeekCloseBookings.length > 0) {
      await tx.booking.deleteMany({
        where: { id: { in: priorWeekCloseBookings.map((b) => b.id) } },
      });
    }

    for (const employee of employees) {
      const holidays =
        holidaysByLocation.get(employee.locationId) ??
        buildHolidayLookup([]);
      const entries = planEntriesByEmployee.get(employee.id) ?? [];
      const result = computeWeeklyBalance(
        week.year,
        week.weekNumber,
        entries,
        holidays,
        {
          weeklyTargetMinutes: employee.weeklyTargetMinutes,
          hazMinutesPerWeek: employee.hazMinutesPerWeek,
          tztModel: employee.tztModel,
          standardWorkDays: effectiveStandardWorkDays(
            employee.standardWorkDays,
            employee.tenant.defaultStandardWorkDays,
          ),
        },
        streakPrefetchByEmp.get(employee.id) ?? [],
      );
      await upsertAndAdvanceErtCases(tx, employee.id, tenantId, result.days, sunday);
      await upsertAndAdvanceCompensationCases(
        tx,
        employee.id,
        tenantId,
        result.days,
        sunday,
        employee.vacationDaysPerYear,
        closedByUserId,
      );

      const accountsToTouch: Set<AccountType> =
        touchedFromPrior.get(employee.id) ?? new Set<AccountType>();
      const bookingsToCreate: Array<{
        accountType: AccountType;
        bookingType: BookingType;
        value: number;
        comment?: string;
      }> = [];

      // FREE_REQUESTED bookings: one per FREE_REQUESTED day, valued at
      // -Tagessoll. computeWeeklyBalance() already accounts for these days
      // as a -Tagessoll contribution inside weeklyZeitsaldoDeltaMinutes
      // (kind=FREE_REQUESTED → soll=Tagessoll, ist=0). To avoid posting
      // the same minutes twice, we strip that contribution out of the
      // AUTO_WEEKLY booking below.
      const freeRequestedDays = result.days.filter(
        (day) => day.kind === "FREE_REQUESTED" && day.sollMinutes > 0,
      );
      const freeRequestedComment = `Frei verlangt KW ${week.weekNumber}/${week.year}`;
      let autoWeeklyZeitsaldoDelta = result.weeklyZeitsaldoDeltaMinutes;
      for (const day of freeRequestedDays) {
        bookingsToCreate.push({
          accountType: "ZEITSALDO",
          bookingType: "FREE_REQUESTED",
          value: -day.sollMinutes,
          comment: freeRequestedComment,
        });
        autoWeeklyZeitsaldoDelta += day.sollMinutes;
      }

      // UEZ_BEZUG: Tag with vollem Tagessoll, Ist = Tagessaldo-neutral; Buchung
      // zulasten UEZ (ohne autoWeeklyZeitsaldoDelta-Anpassung — anders als
      // FREE_REQUESTED).
      const uezBezugDays = result.days.filter(
        (day) => day.kind === "UEZ_BEZUG" && day.sollMinutes > 0,
      );
      const uezBezugComment = `UEZ-Bezug KW ${week.weekNumber}/${week.year}`;
      for (const day of uezBezugDays) {
        bookingsToCreate.push({
          accountType: "UEZ",
          bookingType: "UEZ_REDEMPTION",
          value: -day.sollMinutes,
          comment: uezBezugComment,
        });
      }

      if (autoWeeklyZeitsaldoDelta !== 0) {
        bookingsToCreate.push({
          accountType: "ZEITSALDO",
          bookingType: "AUTO_WEEKLY",
          value: autoWeeklyZeitsaldoDelta,
        });
      }
      if (result.weeklyUezDeltaMinutes !== 0) {
        bookingsToCreate.push({
          accountType: "UEZ",
          bookingType: "AUTO_WEEKLY",
          value: result.weeklyUezDeltaMinutes,
        });
      }
      if (result.vacationDaysDebit !== 0) {
        bookingsToCreate.push({
          accountType: "FERIEN",
          bookingType: "AUTO_WEEKLY",
          value: -result.vacationDaysDebit,
        });
      }
      if (result.parentalCareDaysDebit !== 0) {
        bookingsToCreate.push({
          accountType: "PARENTAL_CARE",
          bookingType: "AUTO_WEEKLY",
          value: -result.parentalCareDaysDebit,
        });
      }
      if (result.holidayCompensationMinutes !== 0) {
        bookingsToCreate.push({
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          bookingType: "AUTO_WEEKLY",
          value: result.holidayCompensationMinutes,
        });
      }

      const defaultComment = `KW ${week.weekNumber}/${week.year}`;
      for (const b of bookingsToCreate) {
        await ensureBalanceRow(
          tx,
          employee.id,
          employee.tenantId,
          b.accountType,
          yearForBookings,
          employee.vacationDaysPerYear,
        );
        await tx.booking.create({
          data: {
            tenantId: employee.tenantId,
            employeeId: employee.id,
            accountType: b.accountType,
            date: sunday,
            value: b.value,
            bookingType: b.bookingType,
            comment: b.comment ?? defaultComment,
            createdByUserId: closedByUserId,
          },
        });
        accountsToTouch.add(b.accountType);
        bookingsCreated += 1;
      }

      if (accountsToTouch.size > 0) {
        for (const accountType of accountsToTouch) {
          await recomputeBalance(tx, employee.id, accountType, yearForBookings);
        }
        employeesAffected += 1;
      }
    }
  }, HEAVY_INTERACTIVE_TX);

  return {
    weekId,
    year: week.year,
    weekNumber: week.weekNumber,
    employeesAffected,
    bookingsCreated,
  };
}

export interface RemoveWeekClosingBookingsResult {
  weekId: string;
  bookingsRemoved: number;
}

/**
 * Reverse week-close bookings for a previously closed week (used when
 * the admin reopens a closed week back to draft). Manual / carryover
 * bookings within the same week are untouched.
 */
export async function removeWeekClosingBookings(
  prisma: PrismaClient,
  weekId: string,
): Promise<RemoveWeekClosingBookingsResult> {
  const week = await prisma.week.findFirst({
    where: { id: weekId, deletedAt: null },
  });
  if (!week) return { weekId, bookingsRemoved: 0 };

  const tenantId = week.tenantId;
  const days = isoWeekDays(week.year, week.weekNumber);
  const monday = days[0].date;
  const sunday = days[6].date;
  const yearForBookings = sunday.getFullYear();

  const weekStart = monday;
  const weekEndExclusive = addDays(sunday, 1);

  let bookingsRemoved = 0;

  await prisma.$transaction(async (tx) => {
    const bookings = await tx.booking.findMany({
      where: {
        tenantId,
        bookingType: { in: ["AUTO_WEEKLY", "FREE_REQUESTED", "UEZ_REDEMPTION"] },
        date: { gte: weekStart, lt: weekEndExclusive },
      },
      select: { id: true, employeeId: true, accountType: true },
    });
    if (bookings.length === 0) return;

    await tx.booking.deleteMany({
      where: { id: { in: bookings.map((b) => b.id) } },
    });
    bookingsRemoved = bookings.length;

    const touched = new Map<string, Set<AccountType>>();
    for (const b of bookings) {
      const set = touched.get(b.employeeId) ?? new Set<AccountType>();
      set.add(b.accountType as AccountType);
      touched.set(b.employeeId, set);
    }
    for (const [employeeId, accounts] of touched) {
      for (const accountType of accounts) {
        await recomputeBalance(tx, employeeId, accountType, yearForBookings);
      }
    }
  }, HEAVY_INTERACTIVE_TX);

  return { weekId, bookingsRemoved };
}

// ---------------------------------------------------------------------------
// Manual bookings
// ---------------------------------------------------------------------------

export interface ApplyManualBookingInput {
  employeeId: string;
  tenantId?: string;
  accountType: AccountType;
  /** Local-midnight date of the booking. */
  date: Date;
  /**
   * Value in account unit. The sign is applied based on bookingType:
   * MANUAL_CREDIT/CORRECTION/OPENING keep the sign as-entered, MANUAL_DEBIT
   * always negates the magnitude.
   */
  value: number;
  bookingType: "MANUAL_CREDIT" | "MANUAL_DEBIT" | "CORRECTION" | "OPENING";
  comment: string;
  createdByUserId: string;
}

export interface ApplyManualBookingResult {
  bookingId: string;
  signedValue: number;
}

export class ManualBookingError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPLOYEE_NOT_FOUND"
      | "ZERO_VALUE"
      | "EMPLOYMENT_NOT_ACTIVE_ON_DATE",
  ) {
    super(message);
    this.name = "ManualBookingError";
  }
}

export async function applyManualBooking(
  prisma: PrismaClient,
  input: ApplyManualBookingInput,
): Promise<ApplyManualBookingResult> {
  if (input.value === 0) {
    throw new ManualBookingError("Wert darf nicht 0 sein", "ZERO_VALUE");
  }

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: {
      id: true,
      tenantId: true,
      vacationDaysPerYear: true,
      entryDate: true,
      exitDate: true,
      deletedAt: true,
    },
  });
  if (
    !employee ||
    employee.deletedAt ||
    (input.tenantId && employee.tenantId !== input.tenantId)
  ) {
    throw new ManualBookingError(
      "Mitarbeitende:r nicht gefunden",
      "EMPLOYEE_NOT_FOUND",
    );
  }
  if (!isEmployeeActiveOnDate(employee, input.date)) {
    throw new ManualBookingError(
      "Buchungsdatum liegt ausserhalb der Anstellungsdauer.",
      "EMPLOYMENT_NOT_ACTIVE_ON_DATE",
    );
  }

  const year = input.date.getFullYear();
  const signedValue =
    input.bookingType === "MANUAL_DEBIT"
      ? -Math.abs(input.value)
      : input.value;

  const booking = await prisma.$transaction(async (tx) => {
    await ensureBalanceRow(
      tx,
      employee.id,
      employee.tenantId,
      input.accountType,
      year,
      employee.vacationDaysPerYear,
    );
    const created = await tx.booking.create({
      data: {
        tenantId: employee.tenantId,
        employeeId: employee.id,
        accountType: input.accountType,
        date: input.date,
        value: signedValue,
        bookingType: input.bookingType,
        comment: input.comment,
        createdByUserId: input.createdByUserId,
      },
    });
    if (input.bookingType === "OPENING") {
      // Retroactive opening balance: fold the booked value into
      // AccountBalance.openingValue so the year actually starts from the
      // corrected number. recomputeBalance below excludes OPENING bookings
      // from its sum (they live in openingValue), so the booking row stays
      // for audit / traceability without double-counting.
      //
      // OPENING bookings are explicitly additive: even if other bookings
      // already exist for the year, posting an OPENING simply shifts the
      // opening (and therefore currentValue) by `input.value`.
      await tx.accountBalance.update({
        where: {
          employeeId_accountType_year: {
            employeeId: employee.id,
            accountType: input.accountType,
            year,
          },
        },
        data: { openingValue: { increment: signedValue } },
      });
    }
    await recomputeBalance(tx, employee.id, input.accountType, year);
    return created;
  });

  return { bookingId: booking.id, signedValue };
}

// ---------------------------------------------------------------------------
// SONNTAG_FEIERTAG_KOMPENSATION — Bezug ("Redemption")
// ---------------------------------------------------------------------------

export interface ApplyCompensationRedemptionInput {
  employeeId: string;
  tenantId?: string;
  /** Local-midnight date the redemption is booked on (drives the year). */
  date: Date;
  /** Positive number of minutes to redeem; signed negatively on the booking row. */
  minutes: number;
  comment: string;
  createdByUserId: string;
}

export interface ApplyCompensationRedemptionResult {
  bookingId: string;
  /** Always negative: the value persisted on the booking row. */
  signedValue: number;
}

export class CompensationRedemptionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPLOYEE_NOT_FOUND"
      | "EMPLOYMENT_NOT_ACTIVE_ON_DATE"
      | "NON_POSITIVE_MINUTES"
      | "INSUFFICIENT_BALANCE",
  ) {
    super(message);
    this.name = "CompensationRedemptionError";
  }
}

/**
 * Redeem ("Bezug") rest minutes from the SONNTAG_FEIERTAG_KOMPENSATION
 * account: posts a single negative booking against that account and
 * recomputes the balance. The account is otherwise driven exclusively by
 * AUTO_WEEKLY bookings from the week-close logic — there is no manual
 * credit/debit path for it.
 *
 * Validations:
 * - employee exists and the booking date lies within the employment span;
 * - minutes is a positive integer;
 * - the current balance for the redemption year is at least `minutes`.
 */
export async function applyCompensationRedemption(
  prisma: PrismaClient,
  input: ApplyCompensationRedemptionInput,
): Promise<ApplyCompensationRedemptionResult> {
  if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
    throw new CompensationRedemptionError(
      "Minuten müssen grösser als 0 sein.",
      "NON_POSITIVE_MINUTES",
    );
  }

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: {
      id: true,
      tenantId: true,
      vacationDaysPerYear: true,
      entryDate: true,
      exitDate: true,
      deletedAt: true,
    },
  });
  if (
    !employee ||
    employee.deletedAt ||
    (input.tenantId && employee.tenantId !== input.tenantId)
  ) {
    throw new CompensationRedemptionError(
      "Mitarbeitende:r nicht gefunden",
      "EMPLOYEE_NOT_FOUND",
    );
  }
  if (!isEmployeeActiveOnDate(employee, input.date)) {
    throw new CompensationRedemptionError(
      "Buchungsdatum liegt ausserhalb der Anstellungsdauer.",
      "EMPLOYMENT_NOT_ACTIVE_ON_DATE",
    );
  }

  const year = input.date.getFullYear();
  const minutes = Math.round(input.minutes);
  const signedValue = -minutes;

  const booking = await prisma.$transaction(async (tx) => {
    await ensureBalanceRow(
      tx,
      employee.id,
      employee.tenantId,
      "SONNTAG_FEIERTAG_KOMPENSATION",
      year,
      employee.vacationDaysPerYear,
    );
    const balance = await tx.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          year,
        },
      },
    });
    const currentValue = balance?.currentValue ?? 0;
    if (currentValue < minutes) {
      throw new CompensationRedemptionError(
        "Nicht genug Sonn-/Feiertagskompensation für diesen Bezug verfügbar.",
        "INSUFFICIENT_BALANCE",
      );
    }
    const created = await tx.booking.create({
      data: {
        tenantId: employee.tenantId,
        employeeId: employee.id,
        accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
        date: input.date,
        value: signedValue,
        bookingType: "COMPENSATION_REDEMPTION",
        comment: input.comment,
        createdByUserId: input.createdByUserId,
      },
    });
    await recomputeBalance(
      tx,
      employee.id,
      "SONNTAG_FEIERTAG_KOMPENSATION",
      year,
    );
    return created;
  });

  return { bookingId: booking.id, signedValue };
}

// ---------------------------------------------------------------------------
// UEZ — Auszahlung
// ---------------------------------------------------------------------------

export type UezPayoutPolicy = "ALLOWED" | "WITH_NOTICE" | "BLOCKED";

export function normalizeUezPayoutPolicy(
  raw: string | null | undefined,
): UezPayoutPolicy {
  if (raw === "WITH_NOTICE" || raw === "BLOCKED") return raw;
  return "ALLOWED";
}

export interface ApplyUezPayoutInput {
  employeeId: string;
  tenantId?: string;
  /** Local-midnight date the payout is booked on (drives the year). */
  date: Date;
  /** Positive number of minutes to pay out; stored negative on the booking row. */
  minutes: number;
  comment: string;
  createdByUserId: string;
  /**
   * Mandanten-Richtlinie — wenn fehlend, wie `ALLOWED`.
   * `BLOCKED` und `WITH_NOTICE` werden in `applyUezPayout` geprüft.
   */
  policy?: UezPayoutPolicy;
  /**
   * Bei `WITH_NOTICE`: Alternative zu einem Kommentar mit mindestens 20 Zeichen.
   * Z. B. „Mitarbeitende: informiert am …“
   */
  acknowledgedNoticeText?: string;
}

export interface ApplyUezPayoutResult {
  bookingId: string;
  /** Always negative: the value persisted on the booking row. */
  signedValue: number;
}

export class UezPayoutError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPLOYEE_NOT_FOUND"
      | "EMPLOYMENT_NOT_ACTIVE_ON_DATE"
      | "NON_POSITIVE_MINUTES"
      | "INSUFFICIENT_BALANCE"
      | "POLICY_BLOCKED"
      | "POLICY_NOTICE_INCOMPLETE",
  ) {
    super(message);
    this.name = "UezPayoutError";
  }
}

/**
 * Pay out UEZ minutes: one negative booking (BookingType.UEZ_PAYOUT) against
 * the UEZ account. Validates employment span and sufficient current balance.
 */
export async function applyUezPayout(
  prisma: PrismaClient,
  input: ApplyUezPayoutInput,
): Promise<ApplyUezPayoutResult> {
  if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
    throw new UezPayoutError(
      "Minuten müssen grösser als 0 sein.",
      "NON_POSITIVE_MINUTES",
    );
  }

  const policy = input.policy ?? "ALLOWED";
  if (policy === "BLOCKED") {
    throw new UezPayoutError(
      "UEZ-Auszahlung ist im Mandanten gesperrt.",
      "POLICY_BLOCKED",
    );
  }
  if (policy === "WITH_NOTICE") {
    const commentOk = input.comment.trim().length >= 20;
    const noticeOk = (input.acknowledgedNoticeText?.trim().length ?? 0) > 0;
    if (!commentOk && !noticeOk) {
      throw new UezPayoutError(
        "Bitte einen ausführlichen Kommentar (mindestens 20 Zeichen) oder einen Hinweis an die Mitarbeitenden angeben.",
        "POLICY_NOTICE_INCOMPLETE",
      );
    }
  }

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: {
      id: true,
      tenantId: true,
      vacationDaysPerYear: true,
      entryDate: true,
      exitDate: true,
      deletedAt: true,
    },
  });
  if (
    !employee ||
    employee.deletedAt ||
    (input.tenantId && employee.tenantId !== input.tenantId)
  ) {
    throw new UezPayoutError("Mitarbeitende:r nicht gefunden", "EMPLOYEE_NOT_FOUND");
  }
  if (!isEmployeeActiveOnDate(employee, input.date)) {
    throw new UezPayoutError(
      "Buchungsdatum liegt ausserhalb der Anstellungsdauer.",
      "EMPLOYMENT_NOT_ACTIVE_ON_DATE",
    );
  }

  const year = input.date.getFullYear();
  const minutes = Math.round(input.minutes);
  const signedValue = -minutes;

  const booking = await prisma.$transaction(async (tx) => {
    await ensureBalanceRow(
      tx,
      employee.id,
      employee.tenantId,
      "UEZ",
      year,
      employee.vacationDaysPerYear,
    );
    const balance = await tx.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "UEZ",
          year,
        },
      },
    });
    const currentValue = balance?.currentValue ?? 0;
    if (currentValue < minutes) {
      throw new UezPayoutError(
        "Nicht genug UEZ-Saldo für diese Auszahlung verfügbar.",
        "INSUFFICIENT_BALANCE",
      );
    }
    const created = await tx.booking.create({
      data: {
        tenantId: employee.tenantId,
        employeeId: employee.id,
        accountType: "UEZ",
        date: input.date,
        value: signedValue,
        bookingType: "UEZ_PAYOUT",
        comment: input.comment,
        createdByUserId: input.createdByUserId,
      },
    });
    await recomputeBalance(tx, employee.id, "UEZ", year);
    return created;
  });

  return { bookingId: booking.id, signedValue };
}

export interface DeleteBookingResult {
  bookingId: string;
  employeeId: string;
  accountType: AccountType;
  bookingType: BookingType;
  value: number;
  date: Date;
}

export class DeleteBookingError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "WEEK_CLOSE_PROTECTED",
  ) {
    super(message);
    this.name = "DeleteBookingError";
  }
}

export async function deleteBooking(
  prisma: PrismaClient,
  bookingId: string,
  tenantId?: string,
): Promise<DeleteBookingResult> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new DeleteBookingError("Buchung nicht gefunden", "NOT_FOUND");
  }
  if (tenantId && booking.tenantId !== tenantId) {
    throw new DeleteBookingError("Buchung nicht gefunden", "NOT_FOUND");
  }
  if (
    booking.bookingType === "AUTO_WEEKLY" ||
    booking.bookingType === "FREE_REQUESTED" ||
    booking.bookingType === "UEZ_REDEMPTION"
  ) {
    throw new DeleteBookingError(
      "Wochenabschluss-Buchungen werden über die Wochenaktionen verwaltet.",
      "WEEK_CLOSE_PROTECTED",
    );
  }

  const year = booking.date.getFullYear();
  await prisma.$transaction(async (tx) => {
    await tx.booking.delete({ where: { id: bookingId } });
    if (booking.bookingType === "OPENING") {
      // Mirror applyManualBooking/applyEmployeeOpeningBalances: OPENING
      // bookings are folded into AccountBalance.openingValue, so deleting
      // one must reverse that contribution before recomputeBalance runs.
      await tx.accountBalance.update({
        where: {
          employeeId_accountType_year: {
            employeeId: booking.employeeId,
            accountType: booking.accountType as AccountType,
            year,
          },
        },
        data: { openingValue: { decrement: booking.value } },
      });
    }
    await recomputeBalance(
      tx,
      booking.employeeId,
      booking.accountType as AccountType,
      year,
    );
  });

  return {
    bookingId: booking.id,
    employeeId: booking.employeeId,
    accountType: booking.accountType as AccountType,
    bookingType: booking.bookingType as BookingType,
    value: booking.value,
    date: booking.date,
  };
}

// ---------------------------------------------------------------------------
// Year-end carryover
// ---------------------------------------------------------------------------

export interface YearEndCarryoverResult {
  fromYear: number;
  toYear: number;
  employeesProcessed: number;
  bookingsCreated: number;
}

/**
 * Year-end carryover for every active employee × account type.
 *
 * Idempotent: prior CARRYOVER bookings dated to Jan 1 of the destination
 * year are removed and rewritten. Opening balance for the new year is set
 * to the configured allowance (FERIEN: vacationDaysPerYear, others: 0).
 */
export async function applyYearEndCarryover(
  prisma: PrismaClient,
  fromYear: number,
  initiatedByUserId: string,
  tenantId?: string,
): Promise<YearEndCarryoverResult> {
  const toYear = fromYear + 1;
  const carryDate = new Date(toYear, 0, 1);
  const carryDateNext = addDays(carryDate, 1);

  const employeeWhere: { isActive: boolean; deletedAt: null; tenantId?: string } = {
    isActive: true,
    deletedAt: null,
  };
  if (tenantId) employeeWhere.tenantId = tenantId;

  const employees = (
    await prisma.employee.findMany({ where: employeeWhere })
  ).filter((employee) => isEmployeeActiveOnDate(employee, carryDate));

  let bookingsCreated = 0;

  await prisma.$transaction(async (tx) => {
    for (const employee of employees) {
      for (const accountType of ACCOUNT_TYPES) {
        const closing = await tx.accountBalance.findUnique({
          where: {
            employeeId_accountType_year: {
              employeeId: employee.id,
              accountType,
              year: fromYear,
            },
          },
        });
        const closingValue = closing?.currentValue ?? 0;
        const allowance =
          accountType === "FERIEN" ? employee.vacationDaysPerYear : 0;

        const plan = planYearRollover({
          accountType,
          unit: ACCOUNT_UNITS[accountType],
          closingValue,
          annualAllowance: allowance,
        });

        const existing = await tx.accountBalance.findUnique({
          where: {
            employeeId_accountType_year: {
              employeeId: employee.id,
              accountType,
              year: toYear,
            },
          },
        });
        if (!existing) {
          await tx.accountBalance.create({
            data: {
              tenantId: employee.tenantId,
              employeeId: employee.id,
              accountType,
              year: toYear,
              openingValue: plan.newYearOpening,
              currentValue: plan.newYearOpening,
              unit: ACCOUNT_UNITS[accountType],
            },
          });
        } else {
          await tx.accountBalance.update({
            where: { id: existing.id },
            data: { openingValue: plan.newYearOpening },
          });
        }

        const priorCarry = await tx.booking.findMany({
          where: {
            employeeId: employee.id,
            accountType,
            bookingType: "CARRYOVER",
            date: { gte: carryDate, lt: carryDateNext },
          },
          select: { id: true },
        });
        if (priorCarry.length > 0) {
          await tx.booking.deleteMany({
            where: { id: { in: priorCarry.map((p) => p.id) } },
          });
        }

        if (plan.carryoverBooking !== 0) {
          await tx.booking.create({
            data: {
              tenantId: employee.tenantId,
              employeeId: employee.id,
              accountType,
              date: carryDate,
              value: plan.carryoverBooking,
              bookingType: "CARRYOVER",
              comment: `Vortrag aus ${fromYear}`,
              createdByUserId: initiatedByUserId,
            },
          });
          bookingsCreated += 1;
        }

        await recomputeBalance(tx, employee.id, accountType, toYear);
      }
    }
  }, HEAVY_INTERACTIVE_TX);

  return {
    fromYear,
    toYear,
    employeesProcessed: employees.length,
    bookingsCreated,
  };
}
