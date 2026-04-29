import { addDays, getISODay } from "date-fns";
import { baseDailySollMinutes } from "@/lib/time/soll";
import { isoDateString } from "@/lib/time/week";

export type RequestType =
  | "VACATION"
  | "FREE_REQUESTED"
  | "UEZ_BEZUG"
  | "TZT"
  | "FREE_DAY"
  | "PARENTAL_CARE";
export type RequestAccountType =
  | "ZEITSALDO"
  | "FERIEN"
  | "UEZ"
  | "TZT"
  | "PARENTAL_CARE";

export interface RequestEntitlementInput {
  type: RequestType;
  startDate: Date;
  endDate: Date;
  weeklyTargetMinutes: number;
  /** Effektive Arbeitstage/Woche (Tenant-Stamm oder Mitarbeiter-Override). */
  standardWorkDays: number;
  /**
   * Pro Kalenderjahr: ISO-Daten (yyyy-MM-dd) mit Feiertagen am Standort —
   * werden bei der Soll-Tag-Zählung ausgeschlossen.
   */
  holidayIsosByYear?: Map<number, Set<string>>;
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

/**
 * Zählt Tage im Antragszeitraum, an denen fachlich Tagessoll > 0 wäre:
 * ISO-Wochentag 1..standardWorkDays (Mo=1 … So=7), ohne Feiertage.
 */
export function requestedSollDaysByYear(
  start: Date,
  end: Date,
  standardWorkDays: number,
  holidayIsosByYear: Map<number, Set<string>>,
): Map<number, number> {
  const out = new Map<number, number>();
  const maxDow = Math.min(Math.max(standardWorkDays, 0), 7);
  if (maxDow === 0) return out;

  for (const day of daysInRange(start, end)) {
    const isoDow = getISODay(day);
    if (isoDow > maxDow) continue;

    const year = day.getFullYear();
    const iso = isoDateString(day);
    if (holidayIsosByYear.get(year)?.has(iso)) continue;

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
  const holidayIsosByYear = input.holidayIsosByYear ?? new Map<number, Set<string>>();

  const sollDaysByYear = requestedSollDaysByYear(
    input.startDate,
    input.endDate,
    input.standardWorkDays,
    holidayIsosByYear,
  );
  if (sollDaysByYear.size === 0) return { ok: true };

  if (effectiveType === "VACATION") {
    for (const [year, requestedDays] of sollDaysByYear) {
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
    for (const [year, requestedDays] of sollDaysByYear) {
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
    for (const [year, requestedDays] of sollDaysByYear) {
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

  if (effectiveType === "UEZ_BEZUG") {
    const dailyTargetMinutes = baseDailySollMinutes(
      input.weeklyTargetMinutes,
      input.standardWorkDays,
    );
    for (const [year, requestedDays] of sollDaysByYear) {
      const neededMinutes = requestedDays * dailyTargetMinutes;
      const available = getAccountValue(input, year, "UEZ");
      if (available < neededMinutes) {
        return {
          ok: false,
          error: `Zu wenig UEZ-Saldo (${year}): benötigt ${Math.round(neededMinutes)} Min., verfügbar ${Math.round(available)} Min.`,
        };
      }
    }
    return { ok: true };
  }

  const dailyTargetMinutes = baseDailySollMinutes(
    input.weeklyTargetMinutes,
    input.standardWorkDays,
  );
  for (const [year, requestedDays] of sollDaysByYear) {
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
