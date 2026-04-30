import { format, parse } from "date-fns";
import { de } from "date-fns/locale";
import { isoWeekDays } from "./week";

/** Vorzeichen + HH:mm wie in den Kontokarten (Minuten). */
export function formatSignedContributionHours(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "−";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Tooltip für FREE_REQUESTED: Buchung am Sonntag der ISO-Kalenderwoche. */
export function freeRequestedZeitsaldoTooltip(
  year: number,
  weekNumber: number,
): string {
  const sun = isoWeekDays(year, weekNumber)[6]!.date;
  const label = format(sun, "EEEE, dd.MM.yyyy", { locale: de });
  return `Tag erfüllt — Bezug reduziert Zeitsaldo (Buchung: ${label})`;
}

/** Hilfsfunktion für Feiertags-Lookup aus ISO-Datum + Name. */
export function holidayMapToLookupInput(
  holidayByIso: Map<string, string>,
): Array<{ date: Date; name: string }> {
  return [...holidayByIso.entries()].map(([iso, name]) => ({
    date: parse(iso, "yyyy-MM-dd", new Date()),
    name,
  }));
}
