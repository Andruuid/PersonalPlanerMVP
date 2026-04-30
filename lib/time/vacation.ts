import type { DayKind } from "./priority";

/**
 * Vacation debit in minutes for a sequence of resolved days.
 *
 * Rule: every VACATION day debits one personal Tagessoll (baseDailyMinutes),
 * while holiday/weekend cases are already excluded by day resolution.
 */
export function vacationDaysDebit(
  days: Array<{ kind: DayKind }>,
  baseDailyMinutes: number,
): number {
  let count = 0;
  for (const d of days) {
    if (d.kind === "VACATION") count += 1;
  }
  return count * baseDailyMinutes;
}

export function parentalCareDaysDebit(days: Array<{ kind: DayKind }>): number {
  let count = 0;
  for (const d of days) {
    if (d.kind === "PARENTAL_CARE") count += 1;
  }
  return count;
}
