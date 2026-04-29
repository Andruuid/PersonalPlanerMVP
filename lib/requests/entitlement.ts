import { addDays } from "date-fns";
import { baseDailySollMinutes } from "@/lib/time/soll";

export type RequestType =
  | "VACATION"
  | "FREE_REQUESTED"
  | "TZT"
  | "FREE_DAY"
  | "PARENTAL_CARE";
export type RequestAccountType = "ZEITSALDO" | "FERIEN" | "TZT" | "PARENTAL_CARE";

export interface RequestEntitlementInput {
  type: RequestType;
  startDate: Date;
  endDate: Date;
  weeklyTargetMinutes: number;
  /** Effektive Arbeitstage/Woche (Tenant-Stamm oder Mitarbeiter-Override). */
  standardWorkDays: number;
  tztModel?: "DAILY_QUOTA" | "TARGET_REDUCTION";
  vacationDaysPerYear: number;
  balancesByYear: Partial<
    Record<number, Partial<Record<RequestAccountType, number>>>
  >;
}

export interface RequestEntitlementResult {
  ok: boolean;
  error?: string;
}

function* daysInRange(start: Date, end: Date): Generator<Date> {
  const total =
    Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  for (let i = 0; i < total; i++) {
    yield addDays(start, i);
  }
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

export function requestedWeekdaysByYear(start: Date, end: Date): Map<number, number> {
  const out = new Map<number, number>();
  for (const day of daysInRange(start, end)) {
    if (!isWeekday(day)) continue;
    const year = day.getFullYear();
    out.set(year, (out.get(year) ?? 0) + 1);
  }
  return out;
}

function getAccountValue(
  input: RequestEntitlementInput,
  year: number,
  accountType: RequestAccountType,
): number {
  const yearBalances = input.balancesByYear[year];
  const fromBalance = yearBalances?.[accountType];
  if (typeof fromBalance === "number") return fromBalance;
  if (accountType === "FERIEN") return input.vacationDaysPerYear;
  return 0;
}

export function evaluateRequestEntitlement(
  input: RequestEntitlementInput,
): RequestEntitlementResult {
  const effectiveType =
    input.type === "FREE_DAY" ? "FREE_REQUESTED" : input.type;
  const tztModel = input.tztModel ?? "DAILY_QUOTA";

  const weekdaysByYear = requestedWeekdaysByYear(input.startDate, input.endDate);
  if (weekdaysByYear.size === 0) return { ok: true };

  if (effectiveType === "VACATION") {
    for (const [year, requestedDays] of weekdaysByYear) {
      const available = getAccountValue(input, year, "FERIEN");
      if (available < requestedDays) {
        return {
          ok: false,
          error: `Zu wenig Ferienguthaben (${year}): benötigt ${requestedDays}, verfügbar ${available}.`,
        };
      }
    }
    return { ok: true };
  }

  if (effectiveType === "TZT") {
    // Model 2 (TARGET_REDUCTION): TZT reduces Soll directly, no TZT day
    // allowance account is consumed.
    if (tztModel === "TARGET_REDUCTION") {
      return { ok: true };
    }
    for (const [year, requestedDays] of weekdaysByYear) {
      const available = getAccountValue(input, year, "TZT");
      if (available < requestedDays) {
        return {
          ok: false,
          error: `Zu wenig TZT-Guthaben (${year}): benötigt ${requestedDays}, verfügbar ${available}.`,
        };
      }
    }
    return { ok: true };
  }

  if (effectiveType === "PARENTAL_CARE") {
    for (const [year, requestedDays] of weekdaysByYear) {
      const available = getAccountValue(input, year, "PARENTAL_CARE");
      if (available < requestedDays) {
        return {
          ok: false,
          error: `Zu wenig Eltern-/Betreuungsurlaub (${year}): benötigt ${requestedDays}, verfügbar ${available}.`,
        };
      }
    }
    return { ok: true };
  }

  const dailyTargetMinutes = baseDailySollMinutes(
    input.weeklyTargetMinutes,
    input.standardWorkDays,
  );
  for (const [year, requestedDays] of weekdaysByYear) {
    const neededMinutes = requestedDays * dailyTargetMinutes;
    const available = getAccountValue(input, year, "ZEITSALDO");
    if (available < neededMinutes) {
      return {
        ok: false,
        error: `Zu wenig Zeitsaldo (${year}): benötigt ${Math.round(neededMinutes)} Min., verfügbar ${Math.round(available)} Min.`,
      };
    }
  }
  return { ok: true };
}
