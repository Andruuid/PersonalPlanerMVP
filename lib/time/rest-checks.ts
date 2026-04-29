import { addDays, parse } from "date-fns";
import { mergeIntervals, type TimeInterval } from "./ert";
import { isoDateString } from "./week";
import type { PlanEntryInput } from "./priority";

/** Art. 9 ArG: min. 11h Ruhezeit zwischen zwei Arbeitsperioden. */
export const DAILY_REST_REQUIRED_MINUTES = 11 * 60;

/** Art. 15 ArG: min. 35h zusammenhängende wöchentliche Ruhezeit. */
export const WEEKLY_REST_REQUIRED_MINUTES = 35 * 60;

export interface PlanEntryWithShiftTimes extends PlanEntryInput {
  date: string;
  /** "HH:mm" from ServiceTemplate or one-time shift */
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
}

function parseLocalDateTime(isoDate: string, hhmm: string): Date | null {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const s = `${isoDate}T${pad(h)}:${pad(min)}:00`;
  const d = parse(s, "yyyy-MM-dd'T'HH:mm:ss", new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Builds wall-clock work intervals from plan rows with explicit start/end.
 * Entries without times or non-shift kinds are skipped.
 */
export function buildIntervalsFromEntries(
  entries: PlanEntryWithShiftTimes[],
): TimeInterval[] {
  const out: TimeInterval[] = [];
  for (const e of entries) {
    if (e.plannedMinutes <= 0) continue;
    if (e.kind !== "SHIFT" && e.kind !== "ONE_TIME_SHIFT") continue;
    const startS = e.shiftStartTime?.trim();
    const endS = e.shiftEndTime?.trim();
    if (!startS || !endS) continue;
    const start = parseLocalDateTime(e.date, startS);
    const end = parseLocalDateTime(e.date, endS);
    if (!start || !end) continue;
    let endAdj = end;
    if (endAdj.getTime() <= start.getTime()) {
      endAdj = addDays(endAdj, 1);
    }
    out.push({ start, end: endAdj });
  }
  return out;
}

/**
 * Prüft die tägliche Ruhezeit zwischen aufeinanderfolgenden (nicht
 * überlappenden) Arbeitsphasen in der Woche.
 */
export function validateDailyRest(weekIntervals: TimeInterval[]): {
  violations: Array<{ date: string; gapMinutes: number }>;
} {
  const merged = mergeIntervals(weekIntervals);
  const violations: Array<{ date: string; gapMinutes: number }> = [];
  const requiredMs = DAILY_REST_REQUIRED_MINUTES * 60_000;
  for (let i = 0; i < merged.length - 1; i += 1) {
    const a = merged[i];
    const b = merged[i + 1];
    const gapMs = b.start.getTime() - a.end.getTime();
    if (gapMs >= requiredMs) continue;
    violations.push({
      date: isoDateString(b.start),
      gapMinutes: Math.max(0, Math.floor(gapMs / 60_000)),
    });
  }
  return { violations };
}

/**
 * Längste zusammenhängende freie Zeitspanne in [weekStart, weekEnd)
 * (weekEnd exklusiv), Arbeitszeiten als `intervals`.
 */
export function validateWeeklyRest(
  weekIntervals: TimeInterval[],
  weekStart: Date,
  weekEnd: Date,
): { ok: boolean; longestGapMinutes: number } {
  if (weekEnd <= weekStart) {
    return { ok: false, longestGapMinutes: 0 };
  }

  const occupied = mergeIntervals(
    weekIntervals
      .map((i) => ({
        start: i.start < weekStart ? weekStart : i.start,
        end: i.end > weekEnd ? weekEnd : i.end,
      }))
      .filter((i) => i.end > i.start),
  );

  const windowMs = weekEnd.getTime() - weekStart.getTime();
  if (occupied.length === 0) {
    return {
      ok: WEEKLY_REST_REQUIRED_MINUTES * 60_000 <= windowMs,
      longestGapMinutes: Math.floor(windowMs / 60_000),
    };
  }

  let longestMs = 0;
  let cursor = weekStart;
  for (const block of occupied) {
    const gap = block.start.getTime() - cursor.getTime();
    if (gap > longestMs) longestMs = gap;
    if (block.end > cursor) cursor = block.end;
  }
  const tail = weekEnd.getTime() - cursor.getTime();
  if (tail > longestMs) longestMs = tail;

  const longestGapMinutes = Math.floor(longestMs / 60_000);
  return {
    ok: longestMs >= WEEKLY_REST_REQUIRED_MINUTES * 60_000,
    longestGapMinutes,
  };
}
