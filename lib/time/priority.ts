export type AbsenceType =
  | "VACATION"
  | "SICK"
  | "ACCIDENT"
  | "FREE_REQUESTED"
  | "UNPAID"
  | "TZT"
  | "HOLIDAY_AUTO";

export type PlanEntryKind = "SHIFT" | "ONE_TIME_SHIFT" | "ABSENCE";

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
  | "WEEKEND_OFF"
  | "WORK_ON_WEEKEND"
  | "SICK"
  | "ACCIDENT"
  | "VACATION"
  | "FREE_REQUESTED"
  | "TZT_ABSENCE"
  | "UNPAID"
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
  HOLIDAY_AUTO: "HOLIDAY",
};

/**
 * Resolve the canonical kind for a single day given the optional plan entry,
 * whether it's a holiday, and whether the day is a weekend day (Sa/So).
 *
 * Priority: HOLIDAY > weekend (work or off) > absence > work > empty.
 */
export function resolveDay(
  entry: PlanEntryInput | null | undefined,
  isHoliday: boolean,
  isWeekend: boolean,
): ResolvedDay {
  if (isHoliday) {
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

  return { kind: "WORK", plannedMinutes: entry.plannedMinutes };
}
