import { describe, expect, it } from "vitest";
import type { TimeInterval } from "../ert";
import {
  buildIntervalsFromEntries,
  validateDailyRest,
  validateWeeklyRest,
  WEEKLY_REST_REQUIRED_MINUTES,
  type PlanEntryWithShiftTimes,
} from "../rest-checks";

describe("validateDailyRest", () => {
  it("erkennt 3h Pause nach Nachtschicht vor Tagdienst als Verstoß", () => {
    const intervals: TimeInterval[] = [
      // Mo 22:00 – Di 06:00 (lokaler Kalender Oktober 2026)
      {
        start: new Date(2026, 9, 5, 22, 0),
        end: new Date(2026, 9, 6, 6, 0),
      },
      { start: new Date(2026, 9, 6, 9, 0), end: new Date(2026, 9, 6, 17, 0) },
    ];
    const { violations } = validateDailyRest(intervals);
    expect(violations).toHaveLength(1);
    expect(violations[0].gapMinutes).toBe(3 * 60);
    expect(violations[0].date).toMatch(/^2026-10-06$/);
  });

  it("akzeptiert ≥11h Pause zwischen zwei Schichten (Mo 08–17 / Di 06–13)", () => {
    const intervals: TimeInterval[] = [
      {
        start: new Date(2026, 9, 5, 8, 0),
        end: new Date(2026, 9, 5, 17, 0),
      },
      {
        start: new Date(2026, 9, 6, 6, 0),
        end: new Date(2026, 9, 6, 14, 0),
      },
    ];
    expect(validateDailyRest(intervals).violations).toHaveLength(0);
  });
});

describe("validateWeeklyRest", () => {
  it("bei leichter Teilbelegung genügt die längste freie Zeit (>35h) für Wochenruhe", () => {
    const weekStart = new Date(2026, 9, 5, 0, 0);
    const weekEnd = new Date(2026, 9, 12, 0, 0);
    const intervals: TimeInterval[] = [
      {
        start: new Date(2026, 9, 5, 22, 0),
        end: new Date(2026, 9, 6, 6, 0),
      },
      { start: new Date(2026, 9, 6, 9, 0), end: new Date(2026, 9, 6, 17, 0) },
    ];
    const r = validateWeeklyRest(intervals, weekStart, weekEnd);
    expect(r.ok).toBe(true);
    expect(r.longestGapMinutes).toBeGreaterThanOrEqual(WEEKLY_REST_REQUIRED_MINUTES);
    // Beispieldaten enthalten zusätzliche große Pause (z. B. Ende Woche ohne Dienst).
  });
});

describe("buildIntervalsFromEntries", () => {
  it("baut Nachtschicht über Mitternacht aus Planzeilen", () => {
    const entries: PlanEntryWithShiftTimes[] = [
      {
        date: "2026-10-05",
        kind: "SHIFT",
        plannedMinutes: 480,
        shiftStartTime: "22:00",
        shiftEndTime: "06:00",
      },
      {
        date: "2026-10-06",
        kind: "SHIFT",
        plannedMinutes: 480,
        shiftStartTime: "09:00",
        shiftEndTime: "17:00",
      },
    ];
    const iv = buildIntervalsFromEntries(entries);
    const { violations } = validateDailyRest(iv);
    expect(violations.length).toBeGreaterThan(0);
  });
});
