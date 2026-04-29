/**
 * Helpers for ServiceTemplate.defaultDays / requiredCount.
 *
 * `defaultDays` is a bitmask following the spec: Mo=1, Di=2, Mi=4, Do=8,
 * Fr=16, Sa=32, So=64. The week index used here is 0=Mo .. 6=So, matching
 * `weekdayShortLabel` in `lib/time/week.ts`.
 */

export const WEEKDAY_BITS = [1, 2, 4, 8, 16, 32, 64] as const;
export const ALL_WEEKDAYS_MASK = 127;

export interface ServiceTemplateCoverage {
  defaultDays: number | null;
  requiredCount: number | null;
}

/** Returns true if the bitmask requires this weekday (0=Mo..6=So). */
export function bitmaskHasWeekday(
  mask: number | null | undefined,
  weekdayIndex: number,
): boolean {
  if (mask == null || mask <= 0) return false;
  const bit = WEEKDAY_BITS[weekdayIndex];
  if (bit === undefined) return false;
  return (mask & bit) !== 0;
}

/** Returns the indices (0=Mo..6=So) that are set in the mask. */
export function weekdayIndicesFromBitmask(
  mask: number | null | undefined,
): number[] {
  if (mask == null || mask <= 0) return [];
  const out: number[] = [];
  for (let i = 0; i < WEEKDAY_BITS.length; i += 1) {
    if ((mask & WEEKDAY_BITS[i]) !== 0) out.push(i);
  }
  return out;
}

/** Builds a bitmask from a list of weekday indices (0=Mo..6=So). */
export function bitmaskFromWeekdayIndices(indices: Iterable<number>): number {
  let mask = 0;
  for (const i of indices) {
    const bit = WEEKDAY_BITS[i];
    if (bit !== undefined) mask |= bit;
  }
  return mask;
}

/**
 * A coverage requirement only applies when both fields are set:
 * a weekday must be flagged in `defaultDays` AND `requiredCount > 0`.
 */
export function hasCoverageRequirement(
  template: ServiceTemplateCoverage,
  weekdayIndex: number,
): boolean {
  if (!bitmaskHasWeekday(template.defaultDays, weekdayIndex)) return false;
  return (template.requiredCount ?? 0) > 0;
}

/**
 * Pure check used by the weekly KPI: a template is understaffed on a given
 * weekday if it has a coverage requirement (defaultDays bit + requiredCount)
 * and the current planned headcount falls short.
 */
export function isUnderstaffed(
  template: ServiceTemplateCoverage,
  weekdayIndex: number,
  plannedCount: number,
): boolean {
  if (!hasCoverageRequirement(template, weekdayIndex)) return false;
  return plannedCount < (template.requiredCount ?? 0);
}
