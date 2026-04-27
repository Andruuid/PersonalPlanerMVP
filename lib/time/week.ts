import {
  addDays,
  format,
  getISOWeek,
  getISOWeekYear,
  parse,
  startOfISOWeek,
  setISOWeek,
  setISOWeekYear,
  isValid,
} from "date-fns";

export interface IsoWeek {
  year: number;
  weekNumber: number;
}

export interface WeekDay {
  date: Date;
  iso: string;
  weekdayLabel: string;
  shortDate: string;
  longDate: string;
}

const WEEKDAY_LABELS = [
  "Mo",
  "Di",
  "Mi",
  "Do",
  "Fr",
  "Sa",
  "So",
] as const;

const LONG_WEEKDAY_LABELS = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;

export function currentIsoWeek(now: Date = new Date()): IsoWeek {
  return {
    year: getISOWeekYear(now),
    weekNumber: getISOWeek(now),
  };
}

export function startOfIsoWeek(year: number, weekNumber: number): Date {
  const base = setISOWeek(setISOWeekYear(new Date(0), year), weekNumber);
  return startOfISOWeek(base);
}

export function isoWeekDays(year: number, weekNumber: number): WeekDay[] {
  const start = startOfIsoWeek(year, weekNumber);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return {
      date,
      iso: format(date, "yyyy-MM-dd"),
      weekdayLabel: WEEKDAY_LABELS[i],
      shortDate: format(date, "dd.MM"),
      longDate: `${LONG_WEEKDAY_LABELS[i]} · ${format(date, "dd.MM")}`,
    };
  });
}

export function shiftWeek(week: IsoWeek, deltaWeeks: number): IsoWeek {
  const ref = setISOWeek(setISOWeekYear(new Date(0), week.year), week.weekNumber);
  const shifted = addDays(startOfISOWeek(ref), deltaWeeks * 7);
  return {
    year: getISOWeekYear(shifted),
    weekNumber: getISOWeek(shifted),
  };
}

export function parseIsoDate(value: string): Date | null {
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return isValid(parsed) ? parsed : null;
}

/**
 * Local calendar `yyyy-MM-dd` for display and map keys. Prefer this over
 * `date.toISOString().slice(0, 10)` (UTC), which can shift the day in CH/EU
 * for values stored as local `parse` midnights.
 */
export function isoDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function weekdayLongLabel(index: number): string {
  return LONG_WEEKDAY_LABELS[index] ?? "";
}

export function weekdayShortLabel(index: number): string {
  return WEEKDAY_LABELS[index] ?? "";
}
