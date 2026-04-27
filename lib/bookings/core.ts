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
import { buildHolidayLookup } from "@/lib/time/holidays";
import { isoDateString, isoWeekDays } from "@/lib/time/week";
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
};

const ACCOUNT_TYPES: AccountType[] = ["ZEITSALDO", "FERIEN", "UEZ", "TZT"];

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
      employeeId,
      accountType,
      year,
      openingValue: opening,
      currentValue: opening,
      unit: ACCOUNT_UNITS[accountType],
    },
  });
}

/** Recompute currentValue = openingValue + sum(bookings.value) for one row. */
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
    },
    select: { value: true },
  });
  const sum = bookings.reduce((acc, b) => acc + b.value, 0);
  await tx.accountBalance.update({
    where: { id: row.id },
    data: { currentValue: row.openingValue + sum },
  });
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
 * Idempotently recompute all AUTO_WEEKLY bookings for one closed week.
 *
 * - Drops any prior AUTO_WEEKLY bookings dated within Mo–So of the week.
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
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) {
    return {
      weekId,
      year: 0,
      weekNumber: 0,
      employeesAffected: 0,
      bookingsCreated: 0,
    };
  }

  const days = isoWeekDays(week.year, week.weekNumber);
  const monday = days[0].date;
  const sunday = days[6].date;
  const yearForBookings = sunday.getFullYear();

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
  });

  const planEntries = await prisma.planEntry.findMany({
    where: { weekId },
  });

  const locationIds = Array.from(new Set(employees.map((e) => e.locationId)));
  const holidayRows = await prisma.holiday.findMany({
    where: {
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
    });
    planEntriesByEmployee.set(e.employeeId, list);
  }

  let employeesAffected = 0;
  let bookingsCreated = 0;

  await prisma.$transaction(async (tx) => {
    const weekStart = monday;
    const weekEndExclusive = addDays(sunday, 1);

    const priorAutoBookings = await tx.booking.findMany({
      where: {
        bookingType: "AUTO_WEEKLY",
        date: { gte: weekStart, lt: weekEndExclusive },
      },
      select: { id: true, employeeId: true, accountType: true },
    });
    const touchedFromPrior = new Map<string, Set<AccountType>>();
    for (const b of priorAutoBookings) {
      const set = touchedFromPrior.get(b.employeeId) ?? new Set<AccountType>();
      set.add(b.accountType as AccountType);
      touchedFromPrior.set(b.employeeId, set);
    }
    if (priorAutoBookings.length > 0) {
      await tx.booking.deleteMany({
        where: { id: { in: priorAutoBookings.map((b) => b.id) } },
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
        },
      );

      const accountsToTouch: Set<AccountType> =
        touchedFromPrior.get(employee.id) ?? new Set<AccountType>();
      const bookingsToCreate: Array<{
        accountType: AccountType;
        value: number;
      }> = [];
      if (result.weeklyZeitsaldoDeltaMinutes !== 0) {
        bookingsToCreate.push({
          accountType: "ZEITSALDO",
          value: result.weeklyZeitsaldoDeltaMinutes,
        });
      }
      if (result.weeklyUezDeltaMinutes !== 0) {
        bookingsToCreate.push({
          accountType: "UEZ",
          value: result.weeklyUezDeltaMinutes,
        });
      }
      if (result.vacationDaysDebit !== 0) {
        bookingsToCreate.push({
          accountType: "FERIEN",
          value: -result.vacationDaysDebit,
        });
      }

      for (const b of bookingsToCreate) {
        await ensureBalanceRow(
          tx,
          employee.id,
          b.accountType,
          yearForBookings,
          employee.vacationDaysPerYear,
        );
        await tx.booking.create({
          data: {
            employeeId: employee.id,
            accountType: b.accountType,
            date: sunday,
            value: b.value,
            bookingType: "AUTO_WEEKLY",
            comment: `KW ${week.weekNumber}/${week.year}`,
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
  });

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
 * Reverse the AUTO_WEEKLY bookings for a previously closed week (used when
 * the admin reopens a closed week back to draft). Manual / carryover
 * bookings within the same week are untouched.
 */
export async function removeWeekClosingBookings(
  prisma: PrismaClient,
  weekId: string,
): Promise<RemoveWeekClosingBookingsResult> {
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) return { weekId, bookingsRemoved: 0 };

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
        bookingType: "AUTO_WEEKLY",
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
  });

  return { weekId, bookingsRemoved };
}

// ---------------------------------------------------------------------------
// Manual bookings
// ---------------------------------------------------------------------------

export interface ApplyManualBookingInput {
  employeeId: string;
  accountType: AccountType;
  /** Local-midnight date of the booking. */
  date: Date;
  /** Magnitude in account unit. The sign is applied based on bookingType. */
  value: number;
  bookingType: "MANUAL_CREDIT" | "MANUAL_DEBIT" | "CORRECTION";
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
    readonly code: "EMPLOYEE_NOT_FOUND" | "ZERO_VALUE",
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
    select: { id: true, vacationDaysPerYear: true },
  });
  if (!employee) {
    throw new ManualBookingError(
      "Mitarbeitende:r nicht gefunden",
      "EMPLOYEE_NOT_FOUND",
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
      input.accountType,
      year,
      employee.vacationDaysPerYear,
    );
    const created = await tx.booking.create({
      data: {
        employeeId: employee.id,
        accountType: input.accountType,
        date: input.date,
        value: signedValue,
        bookingType: input.bookingType,
        comment: input.comment,
        createdByUserId: input.createdByUserId,
      },
    });
    await recomputeBalance(tx, employee.id, input.accountType, year);
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
    readonly code: "NOT_FOUND" | "AUTO_WEEKLY_PROTECTED",
  ) {
    super(message);
    this.name = "DeleteBookingError";
  }
}

export async function deleteBooking(
  prisma: PrismaClient,
  bookingId: string,
): Promise<DeleteBookingResult> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new DeleteBookingError("Buchung nicht gefunden", "NOT_FOUND");
  }
  if (booking.bookingType === "AUTO_WEEKLY") {
    throw new DeleteBookingError(
      "Wochenautomatik-Buchungen werden über die Wochenaktionen verwaltet.",
      "AUTO_WEEKLY_PROTECTED",
    );
  }

  const year = booking.date.getFullYear();
  await prisma.$transaction(async (tx) => {
    await tx.booking.delete({ where: { id: bookingId } });
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
): Promise<YearEndCarryoverResult> {
  const toYear = fromYear + 1;
  const carryDate = new Date(toYear, 0, 1);
  const carryDateNext = addDays(carryDate, 1);

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
  });

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
  });

  return {
    fromYear,
    toYear,
    employeesProcessed: employees.length,
    bookingsCreated,
  };
}
