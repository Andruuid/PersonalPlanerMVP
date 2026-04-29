import type { DayKind } from "./priority";

/**
 * Sum of "real" work minutes (only SHIFT / ONE_TIME_SHIFT — including weekend
 * shifts), used as the basis for the Höchstarbeitszeit (HAZ) check.
 */
export function actualWorkMinutes(
  days: Array<{ kind: DayKind; plannedMinutes: number }>,
): number {
  let total = 0;
  for (const d of days) {
    if (
      d.kind === "WORK" ||
      d.kind === "WORK_ON_WEEKEND" ||
      d.kind === "HOLIDAY_WORK" ||
      d.kind === "HALF_DAY_OFF"
    ) {
      total += d.plannedMinutes;
    }
  }
  return total;
}

/**
 * Weekly UEZ contribution. Anything above the per-employee `hazMinutesPerWeek`
 * cap (default 45h or 50h) is added to the UEZ account. Below the cap → 0.
 */
export function weeklyUezContribution(
  weeklyWorkMinutes: number,
  hazMinutesPerWeek: number,
): number {
  return Math.max(0, weeklyWorkMinutes - hazMinutesPerWeek);
}

/**
 * Weekly UES indicator (Ausweis only, not an account booking):
 * work minutes between weekly Soll and HAZ.
 *
 * - Below/equal Soll: 0
 * - Between Soll and HAZ: work - Soll
 * - Above HAZ: HAZ - Soll (capped)
 */
export function weeklyUesIndicator(
  weeklyWorkMinutes: number,
  weeklySollMinutes: number,
  hazMinutesPerWeek: number,
): number {
  const cappedWork = Math.min(weeklyWorkMinutes, hazMinutesPerWeek);
  return Math.max(0, cappedWork - weeklySollMinutes);
}
