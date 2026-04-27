import type { DayKind } from "./priority";

export const STANDARD_WORK_DAYS = 5;
export type TztModel = "DAILY_QUOTA" | "TARGET_REDUCTION";

/**
 * Daily Sollzeit derived from the employee's weekly target divided across the
 * five standard work days (Mon–Fri). Independent of the actual day kind.
 */
export function baseDailySollMinutes(
  weeklyTargetMinutes: number,
  standardWorkDays: number = STANDARD_WORK_DAYS,
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
  tztModel: TztModel = "DAILY_QUOTA",
  standardWorkDays: number = STANDARD_WORK_DAYS,
): number {
  if (
    kind === "HOLIDAY" ||
    kind === "HOLIDAY_WORK" ||
    kind === "WEEKEND_OFF" ||
    kind === "UNPAID" ||
    kind === "VFT" ||
    (kind === "TZT_ABSENCE" && tztModel === "TARGET_REDUCTION")
  ) {
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
  tztModel: TztModel = "DAILY_QUOTA",
  standardWorkDays: number = STANDARD_WORK_DAYS,
): number {
  switch (kind) {
    case "WORK":
    case "WORK_ON_WEEKEND":
    case "HOLIDAY_WORK":
      return plannedMinutes;
    case "SICK":
    case "ACCIDENT":
    case "VACATION":
    case "PARENTAL_CARE":
    case "SERVICE":
      return baseDailySollMinutes(weeklyTargetMinutes, standardWorkDays);
    case "TZT_ABSENCE":
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
