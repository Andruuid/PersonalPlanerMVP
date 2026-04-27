"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  computeWeeklyBalance,
  type PlanEntryByDate,
} from "@/lib/time/balance";
import { buildHolidayLookup } from "@/lib/time/holidays";
import { isoDateString, isoWeekDays, parseIsoDate } from "@/lib/time/week";
import { planYearRollover } from "@/lib/time/year-rollover";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  AccountType,
  AccountUnit,
  BookingType,
} from "@/lib/generated/prisma/enums";

type Tx = Prisma.TransactionClient;
import {
  fieldErrorsFromZod,
  readOptionalString,
  requireAdmin,
  type ActionResult,
} from "./_shared";

const ACCOUNT_UNITS: Record<AccountType, AccountUnit> = {
  ZEITSALDO: "MINUTES",
  FERIEN: "DAYS",
  UEZ: "MINUTES",
  TZT: "DAYS",
};

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

  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
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
  weekId: string,
  closedByUserId: string,
): Promise<void> {
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) return;

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
  // Pull all holidays for those locations covering the affected year(s); the
  // lookup itself filters by ISO date so an oversized list is harmless.
  const holidayRows = await prisma.holiday.findMany({
    where: {
      locationId: { in: locationIds },
      date: {
        gte: new Date(Date.UTC(week.year - 1, 11, 1)),
        lt: new Date(Date.UTC(week.year + 1, 1, 1)),
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

  const touched: Array<{
    employeeId: string;
    accountTypes: Set<AccountType>;
  }> = [];

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
      }

      if (accountsToTouch.size > 0) {
        for (const accountType of accountsToTouch) {
          await recomputeBalance(tx, employee.id, accountType, yearForBookings);
        }
        touched.push({
          employeeId: employee.id,
          accountTypes: accountsToTouch,
        });
      }
    }
  });

  await writeAudit({
    userId: closedByUserId,
    action: "RECALC_WEEK",
    entity: "Week",
    entityId: weekId,
    newValue: {
      employeesAffected: touched.length,
    },
  });
}

/**
 * Reverse the AUTO_WEEKLY bookings for a previously closed week (used when
 * the admin reopens a closed week back to draft).
 */
export async function removeWeekClosingBookings(
  weekId: string,
  reopenedByUserId: string,
): Promise<void> {
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) return;

  const days = isoWeekDays(week.year, week.weekNumber);
  const monday = days[0].date;
  const sunday = days[6].date;
  const yearForBookings = sunday.getFullYear();

  const weekStart = monday;
  const weekEndExclusive = addDays(sunday, 1);

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

  await writeAudit({
    userId: reopenedByUserId,
    action: "REVERT_RECALC_WEEK",
    entity: "Week",
    entityId: weekId,
  });
}

const manualBookingSchema = z.object({
  employeeId: z.string().min(1, "Mitarbeitende:r erforderlich"),
  accountType: z.enum(["ZEITSALDO", "FERIEN", "UEZ", "TZT"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum ungültig"),
  value: z.coerce.number().refine((v) => v !== 0, {
    message: "Wert darf nicht 0 sein",
  }),
  bookingType: z
    .enum(["MANUAL_CREDIT", "MANUAL_DEBIT", "CORRECTION"])
    .default("MANUAL_CREDIT"),
  comment: z
    .string()
    .min(3, "Bitte einen Grund angeben")
    .max(300, "Maximal 300 Zeichen"),
});

export async function manualBookingAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const raw = {
    employeeId: readOptionalString(formData.get("employeeId")) ?? "",
    accountType: readOptionalString(formData.get("accountType")) ?? "",
    date: readOptionalString(formData.get("date")) ?? "",
    value: formData.get("value"),
    bookingType: readOptionalString(formData.get("bookingType")) ?? undefined,
    comment: readOptionalString(formData.get("comment")) ?? "",
  };

  const parsed = manualBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;

  const date = parseIsoDate(data.date);
  if (!date) return { ok: false, error: "Datum ungültig." };
  const year = date.getFullYear();

  const employee = await prisma.employee.findUnique({
    where: { id: data.employeeId },
    select: { id: true, vacationDaysPerYear: true, isActive: true },
  });
  if (!employee) {
    return { ok: false, error: "Mitarbeitende:r nicht gefunden." };
  }

  // For FERIEN/TZT, the booking value is in DAYS; admin enters days directly.
  // For ZEITSALDO/UEZ, the booking value is in MINUTES.
  const value = data.value;

  const bookingType: BookingType =
    data.bookingType === "MANUAL_DEBIT"
      ? "MANUAL_DEBIT"
      : data.bookingType === "CORRECTION"
        ? "CORRECTION"
        : "MANUAL_CREDIT";
  const signedValue = bookingType === "MANUAL_DEBIT" ? -Math.abs(value) : value;

  const booking = await prisma.$transaction(async (tx) => {
    await ensureBalanceRow(
      tx,
      employee.id,
      data.accountType,
      year,
      employee.vacationDaysPerYear,
    );
    const created = await tx.booking.create({
      data: {
        employeeId: employee.id,
        accountType: data.accountType,
        date,
        value: signedValue,
        bookingType,
        comment: data.comment,
        createdByUserId: admin.id,
      },
    });
    await recomputeBalance(tx, employee.id, data.accountType, year);
    return created;
  });

  await writeAudit({
    userId: admin.id,
    action: "MANUAL_BOOKING",
    entity: "Booking",
    entityId: booking.id,
    newValue: {
      employeeId: employee.id,
      accountType: data.accountType,
      bookingType,
      value: signedValue,
      date: data.date,
    },
    comment: data.comment,
  });

  revalidatePath("/accounts");
  revalidatePath("/my-accounts");
  return { ok: true };
}

export async function deleteBookingAction(
  bookingId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "Buchung nicht gefunden." };
  if (booking.bookingType === "AUTO_WEEKLY") {
    return {
      ok: false,
      error:
        "Wochenautomatik-Buchungen werden über die Wochenaktionen verwaltet.",
    };
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

  await writeAudit({
    userId: admin.id,
    action: "DELETE",
    entity: "Booking",
    entityId: bookingId,
    oldValue: {
      employeeId: booking.employeeId,
      accountType: booking.accountType,
      bookingType: booking.bookingType,
      value: booking.value,
      date: isoDateString(booking.date),
    },
  });

  revalidatePath("/accounts");
  revalidatePath("/my-accounts");
  return { ok: true };
}

const yearEndSchema = z.object({
  fromYear: z.coerce.number().int().min(2000).max(2100),
});

/**
 * Year-end carryover. Picks every active employee, computes the closing
 * balance of `fromYear` per account, then writes a CARRYOVER booking dated
 * Jan 1 of (fromYear+1) into a freshly-created AccountBalance row for the
 * next year. Idempotent: if CARRYOVER bookings already exist for the
 * destination year they are removed first.
 */
export async function runYearEndCarryoverAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = yearEndSchema.safeParse({
    fromYear: formData.get("fromYear"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Jahr prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const fromYear = parsed.data.fromYear;
  const toYear = fromYear + 1;
  const carryDate = new Date(Date.UTC(toYear, 0, 1));

  const employees = await prisma.employee.findMany({
    where: { isActive: true },
  });

  const accountTypes: AccountType[] = ["ZEITSALDO", "FERIEN", "UEZ", "TZT"];

  await prisma.$transaction(async (tx) => {
    for (const employee of employees) {
      for (const accountType of accountTypes) {
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
            data: {
              openingValue: plan.newYearOpening,
            },
          });
        }

        const priorCarry = await tx.booking.findMany({
          where: {
            employeeId: employee.id,
            accountType,
            bookingType: "CARRYOVER",
            date: { gte: carryDate, lt: addDays(carryDate, 1) },
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
              createdByUserId: admin.id,
            },
          });
        }

        await recomputeBalance(tx, employee.id, accountType, toYear);
      }
    }
  });

  await writeAudit({
    userId: admin.id,
    action: "YEAR_END_CARRYOVER",
    entity: "AccountBalance",
    newValue: { fromYear, toYear, employees: employees.length },
  });

  revalidatePath("/accounts");
  revalidatePath("/my-accounts");
  return { ok: true };
}
