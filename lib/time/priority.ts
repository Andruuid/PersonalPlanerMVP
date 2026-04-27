export type AbsenceType =
  | "VACATION"
  | "SICK"
  | "ACCIDENT"
  | "FREE_REQUESTED"
  | "UNPAID"
  | "TZT"
  | "PARENTAL_CARE"
  | "MILITARY_SERVICE"
  | "CIVIL_PROTECTION_SERVICE"
  | "CIVIL_SERVICE"
  | "HOLIDAY_AUTO";

export type PlanEntryKind = "SHIFT" | "ONE_TIME_SHIFT" | "ABSENCE" | "VFT";

export interface PlanEntryInput {
  kind: PlanEntryKind;
  absenceType?: AbsenceType | null;
  plannedMinutes: number;
}

/**
 * Higher-level day classification used by the Zeitlogik. Resolved by
 * priority — Holiday beats everything, then weekend rules, then explicit
 * absence types, then normal work.
 */
export type DayKind =
  | "HOLIDAY"
  | "HOLIDAY_WORK"
  | "WEEKEND_OFF"
  | "WORK_ON_WEEKEND"
  | "SICK"
  | "ACCIDENT"
  | "VACATION"
  | "PARENTAL_CARE"
  | "FREE_REQUESTED"
  | "TZT_ABSENCE"
  | "SERVICE"
  | "UNPAID"
  | "VFT"
  | "WORK"
  | "EMPTY_WEEKDAY";

export interface ResolvedDay {
  kind: DayKind;
  plannedMinutes: number;
}

const ANRECHENBAR_FALLBACK: Record<AbsenceType, DayKind> = {
  VACATION: "VACATION",
  SICK: "SICK",
  ACCIDENT: "ACCIDENT",
  FREE_REQUESTED: "FREE_REQUESTED",
  UNPAID: "UNPAID",
  TZT: "TZT_ABSENCE",
  PARENTAL_CARE: "PARENTAL_CARE",
  MILITARY_SERVICE: "SERVICE",
  CIVIL_PROTECTION_SERVICE: "SERVICE",
  CIVIL_SERVICE: "SERVICE",
  HOLIDAY_AUTO: "HOLIDAY",
};

/**
 * Resolve the canonical kind for a single day given the optional plan entry,
 * whether it's a holiday, and whether the day is a weekend day (Sa/So).
 *
 * Priority: holiday-work/holiday > weekend (work or off) > absence > work > empty.
 */
export function resolveDay(
  entry: PlanEntryInput | null | undefined,
  isHoliday: boolean,
  isWeekend: boolean,
): ResolvedDay {
  if (isHoliday) {
    if (
      entry &&
      (entry.kind === "SHIFT" || entry.kind === "ONE_TIME_SHIFT") &&
      entry.plannedMinutes > 0
    ) {
      return { kind: "HOLIDAY_WORK", plannedMinutes: entry.plannedMinutes };
    }
    return { kind: "HOLIDAY", plannedMinutes: 0 };
  }

  if (isWeekend) {
    if (
      entry &&
      (entry.kind === "SHIFT" || entry.kind === "ONE_TIME_SHIFT") &&
      entry.plannedMinutes > 0
    ) {
      return {
        kind: "WORK_ON_WEEKEND",
        plannedMinutes: entry.plannedMinutes,
      };
    }
    return { kind: "WEEKEND_OFF", plannedMinutes: 0 };
  }

  if (!entry) {
    return { kind: "EMPTY_WEEKDAY", plannedMinutes: 0 };
  }

  if (entry.kind === "ABSENCE") {
    const type = entry.absenceType ?? null;
    if (type) {
      return {
        kind: ANRECHENBAR_FALLBACK[type],
        plannedMinutes: 0,
      };
    }
    return { kind: "EMPTY_WEEKDAY", plannedMinutes: 0 };
  }

  if (entry.kind === "VFT") {
    return { kind: "VFT", plannedMinutes: 0 };
  }

  return { kind: "WORK", plannedMinutes: entry.plannedMinutes };
}
