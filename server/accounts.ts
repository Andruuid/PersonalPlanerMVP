"use server";

import { z } from "zod";
import {
  applyManualBooking,
  ManualBookingError,
  normalizeUezPayoutPolicy,
} from "@/lib/bookings/core";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type {
  AccountType,
  AccountUnit,
  BookingType,
} from "@/lib/generated/prisma/enums";
import { isoDateString, parseIsoDate } from "@/lib/time/week";
import {
  fieldErrorsFromZod,
  requireAdmin,
  safeRevalidatePath,
  type ActionResult,
  type SessionUser,
} from "./_shared";

const parentalCareGrantSchema = z.object({
  employeeId: z.string().min(1, "Mitarbeitende:r erforderlich"),
  days: z.coerce
    .number({ message: "Tage erforderlich" })
    .finite("Ungültige Zahl")
    .positive("Mindestens ein Tag")
    .max(366, "Maximal 366 Tage"),
  comment: z
    .string()
    .trim()
    .min(10, "Begründung mindestens 10 Zeichen")
    .max(500, "Maximal 500 Zeichen"),
});

/**
 * Explizite Admin-Freigabe Eltern-/Betreuungsurlaub: MANUAL_CREDIT auf
 * PARENTAL_CARE mit Audit-Aktion PARENTAL_CARE_GRANT (nicht MANUAL_BOOKING).
 */
export async function grantParentalCareAction(
  employeeId: string,
  days: number,
  comment: string,
): Promise<ActionResult<{ bookingId: string }>> {
  const admin = await requireAdmin();

  const parsed = parentalCareGrantSchema.safeParse({
    employeeId,
    days,
    comment,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const data = parsed.data;

  const emp = await prisma.employee.findFirst({
    where: {
      id: data.employeeId,
      tenantId: admin.tenantId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!emp) {
    return {
      ok: false,
      error: "Mitarbeitende:r nicht gefunden.",
      fieldErrors: { employeeId: "Kein Zugriff oder unbekannt." },
    };
  }

  const dateRaw = isoDateString(new Date());
  const date = parseIsoDate(dateRaw);
  if (!date) {
    return { ok: false, error: "Internes Datumsproblem." };
  }

  try {
    const result = await applyManualBooking(prisma, {
      employeeId: data.employeeId,
      tenantId: admin.tenantId,
      accountType: "PARENTAL_CARE",
      date,
      value: data.days,
      bookingType: "MANUAL_CREDIT",
      comment: data.comment,
      createdByUserId: admin.id,
    });

    await writeAudit({
      userId: admin.id,
      action: "PARENTAL_CARE_GRANT",
      entity: "Booking",
      entityId: result.bookingId,
      newValue: {
        employeeId: data.employeeId,
        days: result.signedValue,
        date: dateRaw,
      },
      comment: data.comment,
    });

    safeRevalidatePath("grantParentalCareAction", "/accounts");
    safeRevalidatePath("grantParentalCareAction", "/my-accounts");
    return { ok: true, data: { bookingId: result.bookingId } };
  } catch (err) {
    if (err instanceof ManualBookingError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

export interface AccountSummary {
  accountType: AccountType;
  unit: AccountUnit;
  openingValue: number;
  currentValue: number;
}

export interface BookingHistoryRow {
  id: string;
  accountType: AccountType;
  unit: AccountUnit;
  date: string;
  value: number;
  bookingType: BookingType;
  comment: string | null;
  createdByEmail: string | null;
  createdAtIso: string;
}

const DEFAULT_UNITS: Record<AccountType, AccountUnit> = {
  ZEITSALDO: "MINUTES",
  FERIEN: "DAYS",
  UEZ: "MINUTES",
  TZT: "DAYS",
  SONNTAG_FEIERTAG_KOMPENSATION: "MINUTES",
  PARENTAL_CARE: "DAYS",
};

/**
 * Returns all account summaries for an employee in `year`. Missing rows
 * are returned as zero-balance defaults so the UI always renders all
 * accounts. Pure read — does not mutate.
 */
export async function loadAccountsForEmployee(
  user: Pick<SessionUser, "tenantId">,
  employeeId: string,
  year: number,
): Promise<Record<AccountType, AccountSummary>> {
  const balances = await prisma.accountBalance.findMany({
    where: { tenantId: user.tenantId, employeeId, year },
  });
  const map: Record<AccountType, AccountSummary> = {
    ZEITSALDO: emptySummary("ZEITSALDO"),
    FERIEN: emptySummary("FERIEN"),
    UEZ: emptySummary("UEZ"),
    TZT: emptySummary("TZT"),
    SONNTAG_FEIERTAG_KOMPENSATION: emptySummary(
      "SONNTAG_FEIERTAG_KOMPENSATION",
    ),
    PARENTAL_CARE: emptySummary("PARENTAL_CARE"),
  };
  for (const b of balances) {
    const type = b.accountType as AccountType;
    map[type] = {
      accountType: type,
      unit: b.unit as AccountUnit,
      openingValue: b.openingValue,
      currentValue: b.currentValue,
    };
  }
  return map;
}

function emptySummary(accountType: AccountType): AccountSummary {
  return {
    accountType,
    unit: DEFAULT_UNITS[accountType],
    openingValue: 0,
    currentValue: 0,
  };
}

export interface AdminAccountsRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  roleLabel: string | null;
  vacationDaysPerYear: number;
  weeklyTargetMinutes: number;
  hazMinutesPerWeek: number;
  tztModel: "DAILY_QUOTA" | "TARGET_REDUCTION";
  locationId: string;
  isActive: boolean;
  accounts: Record<AccountType, AccountSummary>;
}

export interface AdminAccountsTableLoad {
  rows: AdminAccountsRow[];
  uezPayoutPolicy: ReturnType<typeof normalizeUezPayoutPolicy>;
}

/**
 * Loads the per-employee account table the admin Zeitkonten page renders.
 *
 * UES-Jahresspalte war hier temporär mit ausgeliefert; bei Kundenfeedback
 * wieder möglich (Aggregation über PUBLISHED+CLOSED mit computeWeeklyBalance /
 * weeklyUesAusweisMinutes — siehe Git-Historie).
 */
export async function loadAdminAccountsTable(
  user: Pick<SessionUser, "tenantId">,
  year: number,
): Promise<AdminAccountsTableLoad> {
  const employees = await prisma.employee.findMany({
    where: { tenantId: user.tenantId, deletedAt: null },
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    include: {
      tenant: { select: { defaultStandardWorkDays: true, uezPayoutPolicy: true } },
    },
  });
  if (employees.length === 0) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { uezPayoutPolicy: true },
    });
    return {
      rows: [],
      uezPayoutPolicy: normalizeUezPayoutPolicy(tenant?.uezPayoutPolicy),
    };
  }

  const uezPayoutPolicy = normalizeUezPayoutPolicy(
    employees[0]?.tenant?.uezPayoutPolicy,
  );

  const balances = await prisma.accountBalance.findMany({
    where: { tenantId: user.tenantId, year, employeeId: { in: employees.map((e) => e.id) } },
  });

  const byEmployee = new Map<string, typeof balances>();
  for (const b of balances) {
    const list = byEmployee.get(b.employeeId) ?? [];
    list.push(b);
    byEmployee.set(b.employeeId, list);
  }

  return {
    rows: employees.map((e) => {
      const accounts: Record<AccountType, AccountSummary> = {
        ZEITSALDO: emptySummary("ZEITSALDO"),
        FERIEN: { ...emptySummary("FERIEN"), openingValue: e.vacationDaysPerYear },
        UEZ: emptySummary("UEZ"),
        TZT: emptySummary("TZT"),
        SONNTAG_FEIERTAG_KOMPENSATION: emptySummary(
          "SONNTAG_FEIERTAG_KOMPENSATION",
        ),
        PARENTAL_CARE: emptySummary("PARENTAL_CARE"),
      };
      for (const b of byEmployee.get(e.id) ?? []) {
        const type = b.accountType as AccountType;
        accounts[type] = {
          accountType: type,
          unit: b.unit as AccountUnit,
          openingValue: b.openingValue,
          currentValue: b.currentValue,
        };
      }
      return {
        employeeId: e.id,
        firstName: e.firstName,
        lastName: e.lastName,
        roleLabel: e.roleLabel,
        vacationDaysPerYear: e.vacationDaysPerYear,
        weeklyTargetMinutes: e.weeklyTargetMinutes,
        hazMinutesPerWeek: e.hazMinutesPerWeek,
        tztModel: e.tztModel as "DAILY_QUOTA" | "TARGET_REDUCTION",
        locationId: e.locationId,
        isActive: e.isActive,
        accounts,
      };
    }),
    uezPayoutPolicy,
  };
}

/** Booking history for an employee, optionally filtered to a single year. */
export async function loadBookingHistory(
  user: Pick<SessionUser, "tenantId">,
  employeeId: string,
  options: { year?: number; limit?: number } = {},
): Promise<BookingHistoryRow[]> {
  const where: { tenantId: string; employeeId: string; date?: { gte: Date; lt: Date } } = {
    tenantId: user.tenantId,
    employeeId,
  };
  if (options.year !== undefined) {
    where.date = {
      gte: new Date(options.year, 0, 1),
      lt: new Date(options.year + 1, 0, 1),
    };
  }

  const rows = await prisma.booking.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: options.limit,
    include: {
      createdByUser: { select: { email: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    accountType: r.accountType as AccountType,
    unit: DEFAULT_UNITS[r.accountType as AccountType],
    date: isoDateString(r.date),
    value: r.value,
    bookingType: r.bookingType as BookingType,
    comment: r.comment,
    createdByEmail: r.createdByUser.email,
    createdAtIso: r.createdAt.toISOString(),
  }));
}
