import type { DayKind } from "./priority";

/**
 * Number of vacation calendar days that should be debited from the Ferien
 * account for a sequence of resolved days.
 *
 * Rule: 1 day per VACATION absence, but not on holidays or weekends. The
 * resolveDay() priority already collapses Holiday > Vacation, so a vacation
 * absence falling on a holiday will have kind === "HOLIDAY" and is naturally
 * skipped. Same for weekends → "WEEKEND_OFF".
 */
export function vacationDaysDebit(days: Array<{ kind: DayKind }>): number {
  let count = 0;
  for (const d of days) {
    if (d.kind === "VACATION") count += 1;
  }
  return count;
}

export function parentalCareDaysDebit(days: Array<{ kind: DayKind }>): number {
  let count = 0;
  for (const d of days) {
    if (d.kind === "PARENTAL_CARE") count += 1;
  }
  return count;
}
