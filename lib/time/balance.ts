import { isoDateString, isoWeekDays } from "./week";
import {
  resolveDayFromEntries,
  type PlanEntryInput,
  type DayKind,
} from "./priority";
import {
  STANDARD_WORK_DAYS,
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
  contributionMinutes: number;
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
  vacationDaysDebit: number;
  parentalCareDaysDebit: number;
}

export interface EmployeeWeekConfig {
  weeklyTargetMinutes: number;
  hazMinutesPerWeek: number;
  tztModel?: TztModel;
  standardWorkDays?: number;
}

export interface PlanEntryByDate extends PlanEntryInput {
  date: string;
}

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
 */
export function computeWeeklyBalance(
  year: number,
  weekNumber: number,
  entries: PlanEntryByDate[],
  holidays: HolidayLookup,
  config: EmployeeWeekConfig,
): WeeklyComputation {
  const standardWorkDays = config.standardWorkDays ?? STANDARD_WORK_DAYS;
  const tztModel = config.tztModel ?? "DAILY_QUOTA";
  const byDate = new Map<string, PlanEntryByDate[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  const days = isoWeekDays(year, weekNumber).map((d) => {
    const iso = d.iso;
    const isWeekend = isWeekendIso(iso);
    const isHoliday = holidays.has(iso);
    const holidayName = holidays.nameOf(iso);
    const dayEntries = byDate.get(iso) ?? [];
    const resolved = resolveDayFromEntries(dayEntries, isHoliday, isWeekend);
    const sollMinutes = dailySollMinutes(
      resolved.kind,
      config.weeklyTargetMinutes,
      tztModel,
      standardWorkDays,
    );
    const istMinutes = anrechenbarIstMinutes(
      resolved.kind,
      resolved.plannedMinutes,
      config.weeklyTargetMinutes,
      tztModel,
      standardWorkDays,
    );
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
      contributionMinutes: istMinutes - sollMinutes,
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
  const vacation = vacationDaysDebit(days);
  const parentalCare = parentalCareDaysDebit(days);

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
    vacationDaysDebit: vacation,
    parentalCareDaysDebit: parentalCare,
  };
}

/** Convenience: convert a Date to ISO yyyy-MM-dd in the local timezone. */
export function toIsoDate(date: Date): string {
  return isoDateString(date);
}
