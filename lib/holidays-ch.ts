// Swiss public-holiday calendar utilities.
// Used by the seeder and the Settings page year-generator.
// `lib/time/holidays.ts` builds the Sollzeit-aware holiday lookup on top
// of these raw dates.

export interface HolidayDef {
  date: Date;
  name: string;
}

/**
 * Allowed values for `Location.holidayRegionCode`. The MVP simplifies the
 * Swiss canton/parish landscape to a confession choice — Reformed
 * (no Fronleichnam, Mariä Himmelfahrt, Allerheiligen, Mariä Empfängnis)
 * vs. Catholic (with those four feast days). 1. August (Bundesfeier)
 * is always included.
 */
export type HolidayConfession = "EVANGELISCH" | "KATHOLISCH";

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Anonymous Gregorian Easter algorithm — returns Easter Sunday in UTC. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

function offsetDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Reformed (Evangelisch) calendar: Swiss federal holidays including
 * 1. August (Bundesfeier), without the Catholic feast days
 * (Fronleichnam, Mariä Himmelfahrt, Allerheiligen, Mariä Empfängnis).
 */
export function holidaysForReformed(year: number): HolidayDef[] {
  const easter = easterSunday(year);
  return [
    { date: utc(year, 1, 1), name: "Neujahr" },
    { date: utc(year, 1, 2), name: "Berchtoldstag" },
    { date: offsetDays(easter, -2), name: "Karfreitag" },
    { date: offsetDays(easter, 1), name: "Ostermontag" },
    { date: utc(year, 5, 1), name: "Tag der Arbeit" },
    { date: offsetDays(easter, 39), name: "Auffahrt" },
    { date: offsetDays(easter, 50), name: "Pfingstmontag" },
    { date: utc(year, 8, 1), name: "Bundesfeier" },
    { date: utc(year, 12, 25), name: "Weihnachten" },
    { date: utc(year, 12, 26), name: "Stephanstag" },
  ];
}

/**
 * Catholic (Katholisch) calendar: Reformed set plus Fronleichnam,
 * Mariä Himmelfahrt, Allerheiligen and Mariä Empfängnis.
 */
export function holidaysForCatholic(year: number): HolidayDef[] {
  const easter = easterSunday(year);
  return [
    { date: utc(year, 1, 1), name: "Neujahr" },
    { date: utc(year, 1, 2), name: "Berchtoldstag" },
    { date: offsetDays(easter, -2), name: "Karfreitag" },
    { date: offsetDays(easter, 1), name: "Ostermontag" },
    { date: utc(year, 5, 1), name: "Tag der Arbeit" },
    { date: offsetDays(easter, 39), name: "Auffahrt" },
    { date: offsetDays(easter, 50), name: "Pfingstmontag" },
    { date: offsetDays(easter, 60), name: "Fronleichnam" },
    { date: utc(year, 8, 1), name: "Bundesfeier" },
    { date: utc(year, 8, 15), name: "Mariä Himmelfahrt" },
    { date: utc(year, 11, 1), name: "Allerheiligen" },
    { date: utc(year, 12, 8), name: "Mariä Empfängnis" },
    { date: utc(year, 12, 25), name: "Weihnachten" },
    { date: utc(year, 12, 26), name: "Stephanstag" },
  ];
}

/**
 * @deprecated Use {@link holidaysForReformed}. Kept for migration of legacy
 * canton-coded data ("ZH" → Reformed); new locations must store
 * `EVANGELISCH` or `KATHOLISCH`.
 */
export function holidaysForZurich(year: number): HolidayDef[] {
  return holidaysForReformed(year);
}

/**
 * @deprecated Use {@link holidaysForCatholic}. Kept for migration of legacy
 * canton-coded data ("BE" → Catholic).
 */
export function holidaysForBern(year: number): HolidayDef[] {
  return holidaysForCatholic(year);
}

/**
 * @deprecated Use {@link holidaysForCatholic}. Kept for migration of legacy
 * canton-coded data ("BS" → Catholic).
 */
export function holidaysForBaselStadt(year: number): HolidayDef[] {
  return holidaysForCatholic(year);
}

/**
 * @deprecated Use {@link holidaysForCatholic}. Kept for migration of legacy
 * canton-coded data ("LU" → Catholic).
 */
export function holidaysForLucerne(year: number): HolidayDef[] {
  return holidaysForCatholic(year);
}

/**
 * Resolve a `Location.holidayRegionCode` to the matching holiday set.
 *
 * Accepts the new confession codes (`EVANGELISCH`, `KATHOLISCH`) and, for
 * backward compatibility with legacy data, the four canton codes used in
 * earlier seeds (`LU`, `BE`, `BS` → Catholic, `ZH` → Reformed). Any other
 * value throws — there is intentionally no silent fallback so misconfigured
 * locations surface during generation.
 */
export function holidaysForRegion(
  region: string,
  year: number,
): HolidayDef[] {
  const normalized = region.toUpperCase();
  switch (normalized) {
    case "EVANGELISCH":
    case "ZH":
      return holidaysForReformed(year);
    case "KATHOLISCH":
    case "LU":
    case "BE":
    case "BS":
      return holidaysForCatholic(year);
    default:
      throw new Error(
        `Unknown holiday region "${region}". Expected EVANGELISCH or KATHOLISCH.`,
      );
  }
}
