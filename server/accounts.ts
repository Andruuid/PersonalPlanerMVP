import "server-only";

import { prisma } from "@/lib/db";
import { computeWeeklyBalance, type PlanEntryByDate } from "@/lib/time/balance";
import { effectiveStandardWorkDays } from "@/lib/time/soll";
import { buildHolidayLookup } from "@/lib/time/holidays";
import type {
  AccountType,
  AccountUnit,
  BookingType,
} from "@/lib/generated/prisma/enums";
import { isoDateString } from "@/lib/time/week";
import type { SessionUser } from "./_shared";

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
  uesAusweisMinutesYear: number;
  accounts: Record<AccountType, AccountSummary>;
}

/** Loads the per-employee account table the admin Zeitkonten page renders. */
export async function loadAdminAccountsTable(
  user: Pick<SessionUser, "tenantId">,
  year: number,
): Promise<AdminAccountsRow[]> {
  const employees = await prisma.employee.findMany({
    where: { tenantId: user.tenantId, deletedAt: null },
    orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    include: {
      tenant: { select: { defaultStandardWorkDays: true } },
    },
  });
  if (employees.length === 0) return [];

  const balances = await prisma.accountBalance.findMany({
    where: { tenantId: user.tenantId, year, employeeId: { in: employees.map((e) => e.id) } },
  });

  const byEmployee = new Map<string, typeof balances>();
  for (const b of balances) {
    const list = byEmployee.get(b.employeeId) ?? [];
    list.push(b);
    byEmployee.set(b.employeeId, list);
  }

  const closedWeeks = await prisma.week.findMany({
    where: { tenantId: user.tenantId, year, status: "CLOSED", deletedAt: null },
    select: { id: true, year: true, weekNumber: true },
  });
  const planEntries = await prisma.planEntry.findMany({
    where: { weekId: { in: closedWeeks.map((w) => w.id) }, deletedAt: null },
    select: {
      weekId: true,
      employeeId: true,
      date: true,
      kind: true,
      absenceType: true,
      plannedMinutes: true,
    },
  });
  const holidays = await prisma.holiday.findMany({
    where: {
      tenantId: user.tenantId,
      locationId: { in: employees.map((e) => e.locationId) },
      date: { gte: new Date(year - 1, 11, 1), lt: new Date(year + 1, 1, 1) },
    },
  });
  const holidaysByLocation = new Map<string, ReturnType<typeof buildHolidayLookup>>();
  for (const locationId of new Set(employees.map((e) => e.locationId))) {
    holidaysByLocation.set(
      locationId,
      buildHolidayLookup(
        holidays
          .filter((h) => h.locationId === locationId)
          .map((h) => ({ date: h.date, name: h.name })),
      ),
    );
  }
  const entriesByWeekAndEmployee = new Map<string, PlanEntryByDate[]>();
  for (const e of planEntries) {
    const key = `${e.weekId}__${e.employeeId}`;
    const list = entriesByWeekAndEmployee.get(key) ?? [];
    list.push({
      date: isoDateString(e.date),
      kind: e.kind as PlanEntryByDate["kind"],
      absenceType: e.absenceType as PlanEntryByDate["absenceType"],
      plannedMinutes: e.plannedMinutes,
    });
    entriesByWeekAndEmployee.set(key, list);
  }
  const uesByEmployee = new Map<string, number>();
  for (const employee of employees) {
    let ues = 0;
    for (const week of closedWeeks) {
      const key = `${week.id}__${employee.id}`;
      const result = computeWeeklyBalance(
        week.year,
        week.weekNumber,
        entriesByWeekAndEmployee.get(key) ?? [],
        holidaysByLocation.get(employee.locationId) ?? buildHolidayLookup([]),
        {
          weeklyTargetMinutes: employee.weeklyTargetMinutes,
          hazMinutesPerWeek: employee.hazMinutesPerWeek,
          tztModel: employee.tztModel,
          standardWorkDays: effectiveStandardWorkDays(
            employee.standardWorkDays,
            employee.tenant.defaultStandardWorkDays,
          ),
        },
      );
      ues += result.weeklyUesAusweisMinutes;
    }
    uesByEmployee.set(employee.id, ues);
  }

  return employees.map((e) => {
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
      uesAusweisMinutesYear: uesByEmployee.get(e.id) ?? 0,
      accounts,
    };
  });
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
