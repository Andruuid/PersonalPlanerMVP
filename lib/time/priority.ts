export type AbsenceType =
  | "VACATION"
  | "SICK"
  | "ACCIDENT"
  | "FREE_REQUESTED"
  | "UEZ_BEZUG"
  | "UNPAID"
  | "TZT"
  | "PARENTAL_CARE"
  | "MILITARY_SERVICE"
  | "CIVIL_PROTECTION_SERVICE"
  | "CIVIL_SERVICE"
  | "HOLIDAY_AUTO";

export type PlanEntryKind =
  | "SHIFT"
  | "ONE_TIME_SHIFT"
  | "ABSENCE"
  | "VFT"
  | "HALF_DAY_OFF";

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
  | "UEZ_BEZUG"
  | "TZT_ABSENCE"
  | "SERVICE"
  | "UNPAID"
  | "VFT"
  | "HALF_DAY_OFF"
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
  UEZ_BEZUG: "UEZ_BEZUG",
  UNPAID: "UNPAID",
  TZT: "TZT_ABSENCE",
  PARENTAL_CARE: "PARENTAL_CARE",
  MILITARY_SERVICE: "SERVICE",
  CIVIL_PROTECTION_SERVICE: "SERVICE",
  CIVIL_SERVICE: "SERVICE",
  HOLIDAY_AUTO: "HOLIDAY",
};

const ABSENCE_PRIORITY_TIERS: AbsenceType[][] = [
  // 4) Krankheit / Unfall / Dienstleistung / Eltern-Betreuungsurlaub
  [
    "SICK",
    "ACCIDENT",
    "MILITARY_SERVICE",
    "CIVIL_PROTECTION_SERVICE",
    "CIVIL_SERVICE",
    "PARENTAL_CARE",
  ],
  // 5) Ferien
  ["VACATION"],
  // 6) TZT
  ["TZT"],
  // 6b) UEZ-Bezug (hinter TZT, vor Frei verlangt)
  ["UEZ_BEZUG"],
  // 7) Frei verlangt
  ["FREE_REQUESTED"],
  // 8) Urlaub unbezahlt
  ["UNPAID"],
  ["HOLIDAY_AUTO"],
];

function isShiftLike(entry: PlanEntryInput): boolean {
  return entry.kind === "SHIFT" || entry.kind === "ONE_TIME_SHIFT";
}

const DEFAULT_HALF_DAY_OFF_MINUTES = 240;

export { DEFAULT_HALF_DAY_OFF_MINUTES };

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
      isShiftLike(entry) &&
      entry.plannedMinutes > 0
    ) {
      return { kind: "HOLIDAY_WORK", plannedMinutes: entry.plannedMinutes };
    }
    return { kind: "HOLIDAY", plannedMinutes: 0 };
  }

  if (isWeekend) {
    if (
      entry &&
      isShiftLike(entry) &&
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

  if (entry.kind === "HALF_DAY_OFF") {
    return {
      kind: "HALF_DAY_OFF",
      plannedMinutes: entry.plannedMinutes || DEFAULT_HALF_DAY_OFF_MINUTES,
    };
  }

  return { kind: "WORK", plannedMinutes: entry.plannedMinutes };
}

/**
 * Resolve day kind from potentially multiple plan entries for the same date.
 *
 * 10-step absence layering (spec + UEZ-Bezug):
 * 1) Holiday
 * 2) Weekend without Soll
 * 3) ERT (represented by HOLIDAY_WORK with >5h, evaluated downstream)
 * 4) SICK / ACCIDENT / SERVICE / PARENTAL_CARE
 * 5) VACATION
 * 6) TZT
 * 7) UEZ_BEZUG
 * 8) FREE_REQUESTED
 * 9) UNPAID
 * 10) normal WORK
 */
export function resolveDayFromEntries(
  entries: PlanEntryInput[],
  isHoliday: boolean,
  isWeekend: boolean,
): ResolvedDay {
  if (entries.length === 0) return resolveDay(null, isHoliday, isWeekend);

  if (isHoliday) {
    const holidayShift = entries.find(
      (entry) => isShiftLike(entry) && entry.plannedMinutes > 0,
    );
    if (holidayShift) {
      return { kind: "HOLIDAY_WORK", plannedMinutes: holidayShift.plannedMinutes };
    }
    return { kind: "HOLIDAY", plannedMinutes: 0 };
  }

  if (isWeekend) {
    const weekendShift = entries.find(
      (entry) => isShiftLike(entry) && entry.plannedMinutes > 0,
    );
    if (weekendShift) {
      return { kind: "WORK_ON_WEEKEND", plannedMinutes: weekendShift.plannedMinutes };
    }
    const halfWd = entries.find((entry) => entry.kind === "HALF_DAY_OFF");
    if (halfWd) {
      return {
        kind: "HALF_DAY_OFF",
        plannedMinutes: halfWd.plannedMinutes || DEFAULT_HALF_DAY_OFF_MINUTES,
      };
    }
    return { kind: "WEEKEND_OFF", plannedMinutes: 0 };
  }

  const absenceTypes = new Set<AbsenceType>();
  for (const entry of entries) {
    if (entry.kind === "ABSENCE" && entry.absenceType) {
      absenceTypes.add(entry.absenceType);
    }
  }
  for (const tier of ABSENCE_PRIORITY_TIERS) {
    const matched = tier.find((type) => absenceTypes.has(type));
    if (matched) {
      return { kind: ANRECHENBAR_FALLBACK[matched], plannedMinutes: 0 };
    }
  }

  const halfDay = entries.find((entry) => entry.kind === "HALF_DAY_OFF");
  if (halfDay) {
    return {
      kind: "HALF_DAY_OFF",
      plannedMinutes: halfDay.plannedMinutes || DEFAULT_HALF_DAY_OFF_MINUTES,
    };
  }

  if (entries.some((entry) => entry.kind === "VFT")) {
    return { kind: "VFT", plannedMinutes: 0 };
  }

  const weekdayShift = entries.find((entry) => isShiftLike(entry));
  if (weekdayShift) {
    return { kind: "WORK", plannedMinutes: weekdayShift.plannedMinutes };
  }

  return { kind: "EMPTY_WEEKDAY", plannedMinutes: 0 };
}
