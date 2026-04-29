import type { DayKind } from "./priority";

export type TztModel = "DAILY_QUOTA" | "TARGET_REDUCTION";

/**
 * Daily Sollzeit derived from the employee's weekly target divided across
 * {@link standardWorkDays} nominal work days (spec e.g. Mon–Fri). Independent
 * of the actual day kind.
 */
export function baseDailySollMinutes(
  weeklyTargetMinutes: number,
  standardWorkDays: number,
): number {
  if (standardWorkDays <= 0) return 0;
  return weeklyTargetMinutes / standardWorkDays;
}

/**
 * Tagessoll after applying the day priority. Holidays and weekends-off both
 * reduce Soll to 0; UNPAID also reduces to 0 (employee owes nothing for an
 * unpaid day). All other kinds (including weekend work) keep the base
 * Tagessoll.
 */
export function dailySollMinutes(
  kind: DayKind,
  weeklyTargetMinutes: number,
  tztModel: TztModel,
  standardWorkDays: number,
): number {
  if (
    kind === "HOLIDAY" ||
    kind === "HOLIDAY_WORK" ||
    kind === "WEEKEND_OFF" ||
    kind === "UNPAID" ||
    kind === "VFT"
  ) {
    return 0;
  }
  if (kind === "HALF_DAY_OFF") {
    return baseDailySollMinutes(weeklyTargetMinutes, standardWorkDays) / 2;
  }
  // Modell 2 (TARGET_REDUCTION): keine neuen TZT-Planungen; Legacy-Zeilen werten
  // Soll 0 / Ist 0 — neutral für Zeitsaldo (Soll-Reduktion statt Ist-Gutschrift).
  if (kind === "TZT_ABSENCE" && tztModel === "TARGET_REDUCTION") {
    return 0;
  }
  return baseDailySollMinutes(weeklyTargetMinutes, standardWorkDays);
}

/**
 * Anrechenbare Istzeit for absence types that should NOT reduce the
 * Zeitsaldo: VACATION, PARENTAL_CARE, SICK, ACCIDENT, SERVICE, TZT_ABSENCE
 * all credit the day's Soll back as Ist so the day balance is 0.
 */
export function anrechenbarIstMinutes(
  kind: DayKind,
  plannedMinutes: number,
  weeklyTargetMinutes: number,
  tztModel: TztModel,
  standardWorkDays: number,
): number {
  switch (kind) {
    case "WORK":
    case "WORK_ON_WEEKEND":
    case "HOLIDAY_WORK":
      return plannedMinutes;
    case "HALF_DAY_OFF":
      /** UI may keep 240 as display; balance uses Tagessoll / 2 (same as {@link dailySollMinutes}). */
      return baseDailySollMinutes(weeklyTargetMinutes, standardWorkDays) / 2;
    case "SICK":
    case "ACCIDENT":
    case "VACATION":
    case "PARENTAL_CARE":
    case "SERVICE":
      return baseDailySollMinutes(weeklyTargetMinutes, standardWorkDays);
    case "UEZ_BEZUG":
      return baseDailySollMinutes(weeklyTargetMinutes, standardWorkDays);
    case "TZT_ABSENCE":
      // TARGET_REDUCTION: identisch EMPTY_WEEKDAY — kein Ist-Zuschlag (Pfad nur Legacy-Daten).
      return tztModel === "TARGET_REDUCTION"
        ? 0
        : baseDailySollMinutes(weeklyTargetMinutes, standardWorkDays);
    case "HOLIDAY":
    case "WEEKEND_OFF":
    case "UNPAID":
    case "VFT":
    case "FREE_REQUESTED":
    case "EMPTY_WEEKDAY":
      return 0;
  }
}

/** Resolved Arbeitstage/Woche: Mitarbeiter-Override oder Tenant-Stammwert. */
export function effectiveStandardWorkDays(
  employeeOverride: number | null | undefined,
  tenantDefaultStandardWorkDays: number,
): number {
  return employeeOverride ?? tenantDefaultStandardWorkDays;
}
