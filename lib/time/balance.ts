import { addDays } from "date-fns";
import { isoDateString, isoWeekDays, startOfIsoWeek } from "./week";
import {
  resolveDayFromEntries,
  type DayKind,
} from "./priority";
import {
  anrechenbarIstMinutes,
  baseDailySollMinutes,
  dailySollMinutes,
  type TztModel,
} from "./soll";
import {
  actualWorkMinutes,
  weeklyUesIndicator,
  weeklyUezContribution,
} from "./overtime";
import { parentalCareDaysDebit, vacationDaysDebit } from "./vacation";
import type { HolidayLookup } from "./holidays";
import {
  buildIntervalsFromEntries,
  buildLaborDayFactsForRange,
  type PlanEntryWithShiftTimes,
  countConsecutiveWorkDays,
  requiresHalfDayOff,
  validateDailyRest,
  validateWeeklyRest,
} from "./rest-checks";

export interface DayComputation {
  iso: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  kind: DayKind;
  sollMinutes: number;
  istMinutes: number;
  plannedMinutes: number;
  /** Spec visibility: holiday on a workday yields a day-credit equal to base Soll. */
  holidayCreditMinutes: number;
  /** Ist − Soll (inkl. FREE_REQUESTED −Tagessoll); unverändert für interne / Wochenlogik. */
  contributionMinutes: number;
  /** Tagesanzeige Ist − Soll; bei FREE_REQUESTED 0 (Tag erfüllt, Abzug nur über Buchung). */
  displayContributionMinutes: number;
}

export interface WeeklyComputation {
  year: number;
  weekNumber: number;
  days: DayComputation[];
  totalSollMinutes: number;
  totalIstMinutes: number;
  totalHolidayCreditMinutes: number;
  holidayWorkMinutes: number;
  holidayCompensationMinutes: number;
  holidayErtOpen: boolean;
  weeklyZeitsaldoDeltaMinutes: number;
  weeklyWorkMinutes: number;
  weeklyUesAusweisMinutes: number;
  weeklyUezDeltaMinutes: number;
  vacationMinutesDebit: number;
  parentalCareDaysDebit: number;
  dailyRestViolations: Array<{ date: string; gapMinutes: number }>;
  weeklyRestOk: boolean;
  weeklyRestLongestGapMinutes: number;
  maxConsecutiveWorkDays: number;
  consecutiveWorkDayViolations: string[];
  /** True wenn Arbeit auf > 5 verschiedenen Tagen verteilt ohne HALF_DAY_OFF in KW */
  halfDayOffMissing: boolean;
}

export interface EmployeeWeekConfig {
  weeklyTargetMinutes: number;
  hazMinutesPerWeek: number;
  tztModel?: TztModel;
  standardWorkDays: number;
  employmentRange?: {
    entryIso: string;
    exitIso?: string | null;
  };
}

/** Plan row for Zeitlogik; optional shift times enable Ruhezeit-Checks. */
export type PlanEntryByDate = PlanEntryWithShiftTimes;

function isWeekendIso(iso: string): boolean {
  const date = new Date(`${iso}T00:00:00Z`);
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Compute the full weekly balance breakdown for one employee.
 *
 * `entries` may contain multiple rows per date. Day resolution applies
 * deterministic conflict priority (e.g. SICK/ACCIDENT win over TZT).
 *
 * `streakContextEntries`: Plan-Zeilen im Fenster bis 14 Kalendertage vor Mo–So
 * der KW (gleicher:d Mitarbeitende:r), zur Prüfung auf max. 6 Arbeitstage in Folge.
 */
export function computeWeeklyBalance(
  year: number,
  weekNumber: number,
  entries: PlanEntryByDate[],
  holidays: HolidayLookup,
  config: EmployeeWeekConfig,
  streakContextEntries?: PlanEntryByDate[],
): WeeklyComputation {
  const standardWorkDays = config.standardWorkDays;
  const tztModel = config.tztModel ?? "DAILY_QUOTA";
  const byDate = new Map<string, PlanEntryByDate[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  const wd = isoWeekDays(year, weekNumber);
  const weekStart = startOfIsoWeek(year, weekNumber);
  const employmentRange = config.employmentRange;
  const isEmploymentActiveOnIso = (iso: string): boolean => {
    if (!employmentRange) return true;
    if (iso < employmentRange.entryIso) return false;
    if (employmentRange.exitIso && iso > employmentRange.exitIso) return false;
    return true;
  };
  const days = wd.map((d) => {
    const iso = d.iso;
    const isWeekend = isWeekendIso(iso);
    const isHoliday = holidays.has(iso);
    const holidayName = holidays.nameOf(iso);
    const dayEntries = byDate.get(iso) ?? [];
    const isEmploymentActive = isEmploymentActiveOnIso(iso);
    if (!isEmploymentActive) {
      const dayCalc: DayComputation = {
        iso,
        isWeekend,
        isHoliday,
        holidayName,
        kind: "EMPTY_WEEKDAY",
        sollMinutes: 0,
        istMinutes: 0,
        plannedMinutes: 0,
        holidayCreditMinutes: 0,
        contributionMinutes: 0,
        displayContributionMinutes: 0,
      };
      return dayCalc;
    }
    const resolved = resolveDayFromEntries(dayEntries, isHoliday, isWeekend);
    const isAdditionalWeekendWork =
      resolved.kind === "WORK_ON_WEEKEND" &&
      resolved.weekendWorkClassification === "ADDITIONAL";
    const sollMinutes = isAdditionalWeekendWork
      ? 0
      : dailySollMinutes(
          resolved.kind,
          config.weeklyTargetMinutes,
          tztModel,
          standardWorkDays,
        );
    const istMinutes = isAdditionalWeekendWork
      ? resolved.plannedMinutes
      : anrechenbarIstMinutes(
          resolved.kind,
          resolved.plannedMinutes,
          config.weeklyTargetMinutes,
          tztModel,
          standardWorkDays,
        );
    const rawContribution = istMinutes - sollMinutes;
    const dayCalc: DayComputation = {
      iso,
      isWeekend,
      isHoliday,
      holidayName,
      kind: resolved.kind,
      sollMinutes,
      istMinutes,
      plannedMinutes: resolved.plannedMinutes,
      holidayCreditMinutes:
        resolved.kind === "HOLIDAY" && !isWeekend
          ? baseDailySollMinutes(config.weeklyTargetMinutes, standardWorkDays)
          : 0,
      contributionMinutes: rawContribution,
      displayContributionMinutes:
        resolved.kind === "FREE_REQUESTED" ? 0 : rawContribution,
    };
    return dayCalc;
  });

  const totalSoll = days.reduce((acc, d) => acc + d.sollMinutes, 0);
  const totalIst = days.reduce((acc, d) => acc + d.istMinutes, 0);
  const totalHolidayCredit = days.reduce(
    (acc, d) => acc + d.holidayCreditMinutes,
    0,
  );
  const holidayWorkMinutes = days
    .filter((d) => d.kind === "HOLIDAY_WORK")
    .reduce((acc, d) => acc + d.plannedMinutes, 0);
  const holidayCompensationMinutes =
    holidayWorkMinutes > 0 && holidayWorkMinutes <= 300 ? holidayWorkMinutes : 0;
  const holidayErtOpen = holidayWorkMinutes > 300;
  const weeklyWork = actualWorkMinutes(days);
  const nonWorkAnrechenbarIst = totalIst - weeklyWork;
  const cappedWorkForZeitsaldo = Math.min(weeklyWork, config.hazMinutesPerWeek);
  const weeklyZeitsaldoDelta =
    cappedWorkForZeitsaldo + nonWorkAnrechenbarIst - totalSoll;
  const weeklyUesAusweis = weeklyUesIndicator(
    weeklyWork,
    totalSoll,
    config.hazMinutesPerWeek,
  );
  const weeklyUez = weeklyUezContribution(weeklyWork, config.hazMinutesPerWeek);
  const vacation = vacationDaysDebit(
    days,
    baseDailySollMinutes(config.weeklyTargetMinutes, standardWorkDays),
  );
  const parentalCare = parentalCareDaysDebit(days);

  const weekEndExclusive = addDays(weekStart, 7);
  const activeEntries = entries.filter((e) => isEmploymentActiveOnIso(e.date));
  const activeStreakContextEntries = (streakContextEntries ?? []).filter((e) =>
    isEmploymentActiveOnIso(e.date),
  );
  const restIntervals = buildIntervalsFromEntries(activeEntries);
  const { violations: dailyRestViolations } = validateDailyRest(restIntervals);
  const weeklyRest = validateWeeklyRest(restIntervals, weekStart, weekEndExclusive);

  const mergedForStreak: PlanEntryByDate[] = activeStreakContextEntries.length
    ? [...activeStreakContextEntries, ...activeEntries]
    : [...activeEntries];

  const streakFrom = isoDateString(addDays(weekStart, -14));
  const streakTo = wd[6]!.iso;
  const laborFacts = buildLaborDayFactsForRange(streakFrom, streakTo, mergedForStreak, holidays);
  const streakResult = countConsecutiveWorkDays(
    laborFacts.map((row) => ({ date: row.date, isWorkDay: row.isWorkDay })),
  );
  const weekIsos = new Set(wd.map((d) => d.iso));
  const weekFacts = laborFacts.filter((f) => weekIsos.has(f.date));

  const halfDayOffMissing = requiresHalfDayOff(weekFacts);

  return {
    year,
    weekNumber,
    days,
    totalSollMinutes: totalSoll,
    totalIstMinutes: totalIst,
    totalHolidayCreditMinutes: totalHolidayCredit,
    holidayWorkMinutes,
    holidayCompensationMinutes,
    holidayErtOpen,
    weeklyZeitsaldoDeltaMinutes: weeklyZeitsaldoDelta,
    weeklyWorkMinutes: weeklyWork,
    weeklyUesAusweisMinutes: weeklyUesAusweis,
    weeklyUezDeltaMinutes: weeklyUez,
    vacationMinutesDebit: vacation,
    parentalCareDaysDebit: parentalCare,
    dailyRestViolations,
    weeklyRestOk: weeklyRest.ok,
    weeklyRestLongestGapMinutes: weeklyRest.longestGapMinutes,
    maxConsecutiveWorkDays: streakResult.maxConsecutiveWorkDays,
    consecutiveWorkDayViolations: streakResult.violationDates,
    halfDayOffMissing,
  };
}

/** Convenience: convert a Date to ISO yyyy-MM-dd in the local timezone. */
export function toIsoDate(date: Date): string {
  return isoDateString(date);
}
