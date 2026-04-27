// Swiss public-holiday calendar utilities.
// Used by the seeder and the Settings page year-generator.
// `lib/time/holidays.ts` builds the Sollzeit-aware holiday lookup on top
// of these raw dates.

export interface HolidayDef {
  date: Date;
  name: string;
}

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
 * Simplified Kanton Zürich (ZH): eidgenössische / ZH-übliche Feiertage ohne
 * die katholischen Extras (kein Fronleichnam, 15.8, 1.11, 8.12 in diesem Set).
 */
export function holidaysForZurich(year: number): HolidayDef[] {
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
 * Simplified Kanton Bern (BE): ZH-Basis zuzüglich gängiger katholisch geprägter
 * kantonaler Tage (15.8, 1.11, 8.12) — Demo-Näherung, Gemeinden weichen ab.
 */
export function holidaysForBern(year: number): HolidayDef[] {
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
    { date: utc(year, 8, 15), name: "Mariä Himmelfahrt" },
    { date: utc(year, 11, 1), name: "Allerheiligen" },
    { date: utc(year, 12, 8), name: "Mariä Empfängnis" },
    { date: utc(year, 12, 25), name: "Weihnachten" },
    { date: utc(year, 12, 26), name: "Stephanstag" },
  ];
}

/**
 * Simplified Basel-Stadt (BS): ZH-ähnlich zuzüglich Fronleichnam
 * (in BS gesetzlicher Feiertag).
 */
export function holidaysForBaselStadt(year: number): HolidayDef[] {
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
    { date: utc(year, 12, 25), name: "Weihnachten" },
    { date: utc(year, 12, 26), name: "Stephanstag" },
  ];
}

/**
 * Holidays for the Canton of Lucerne (LU) — Swiss federal holidays plus the
 * Catholic Lucerne-specific days. Used as the default in the MVP demo.
 */
export function holidaysForLucerne(year: number): HolidayDef[] {
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

/** Region codes with built-in rules: LU, ZH, BE, BS. Unknown → LU. */
export function holidaysForRegion(
  region: string,
  year: number,
): HolidayDef[] {
  switch (region.toUpperCase()) {
    case "ZH":
      return holidaysForZurich(year);
    case "BE":
      return holidaysForBern(year);
    case "BS":
      return holidaysForBaselStadt(year);
    case "LU":
    default:
      return holidaysForLucerne(year);
  }
}
