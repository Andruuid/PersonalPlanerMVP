import { describe, expect, it } from "vitest";
import { computeWeeklyBalance, type PlanEntryByDate } from "../balance";
import { buildHolidayLookup } from "../holidays";
import { isoWeekDays } from "../week";

const noHolidays = buildHolidayLookup([]);

const FULL_PENSUM = {
  weeklyTargetMinutes: 2520, // 100% pensum, 42h
  hazMinutesPerWeek: 2700, // 45h
};

// Use a fixed reference week well clear of CH holidays (KW 41, 2026: Mon
// 2026-10-05 → Sun 2026-10-11). We pass an empty holiday lookup so weekend
// rules and absences are tested in isolation.
const YEAR = 2026;
const WEEK = 41;

function asEntries(
  byDate: Record<string, Omit<PlanEntryByDate, "date">>,
): PlanEntryByDate[] {
  return Object.entries(byDate).map(([date, value]) => ({ date, ...value }));
}

describe("computeWeeklyBalance — full pensum, plain Mon-Fri shifts", () => {
  it("balances to 0 when each weekday is a 504-min shift", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries(
      Object.fromEntries(
        days
          .slice(0, 5)
          .map((d) => [d.iso, { kind: "SHIFT", plannedMinutes: 504 }]),
      ),
    );
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      noHolidays,
      FULL_PENSUM,
    );

    expect(result.totalSollMinutes).toBe(2520);
    expect(result.totalIstMinutes).toBe(2520);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
    expect(result.weeklyWorkMinutes).toBe(2520);
    expect(result.weeklyUezDeltaMinutes).toBe(0);
    expect(result.vacationDaysDebit).toBe(0);
  });

  it("counts overwork against UEZ when weekly work exceeds the 45h HAZ", () => {
    // 6 weekday shifts × 480 minutes = 2880 (above 2700). Note: we still only
    // have 5 weekdays — so we mix in a Saturday shift to reach the cap.
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "SHIFT", plannedMinutes: 600 }, // Mon
      [days[1].iso]: { kind: "SHIFT", plannedMinutes: 600 }, // Tue
      [days[2].iso]: { kind: "SHIFT", plannedMinutes: 600 }, // Wed
      [days[3].iso]: { kind: "SHIFT", plannedMinutes: 600 }, // Thu
      [days[4].iso]: { kind: "SHIFT", plannedMinutes: 600 }, // Fri
      [days[5].iso]: { kind: "SHIFT", plannedMinutes: 360 }, // Sat (weekend)
    });
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      noHolidays,
      FULL_PENSUM,
    );
    // Soll = 5 × 504 = 2520 (Saturday Soll = 0). Ist = 5 × 600 + 360 = 3360.
    expect(result.totalSollMinutes).toBe(2520);
    expect(result.totalIstMinutes).toBe(3360);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(840);
    expect(result.weeklyWorkMinutes).toBe(3360);
    expect(result.weeklyUezDeltaMinutes).toBe(660); // 3360 - 2700
  });

  it("treats vacation as anrechenbar — week balance stays at 0", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "ABSENCE", absenceType: "VACATION", plannedMinutes: 0 },
      [days[1].iso]: { kind: "ABSENCE", absenceType: "VACATION", plannedMinutes: 0 },
      [days[2].iso]: { kind: "ABSENCE", absenceType: "VACATION", plannedMinutes: 0 },
      [days[3].iso]: { kind: "ABSENCE", absenceType: "VACATION", plannedMinutes: 0 },
      [days[4].iso]: { kind: "ABSENCE", absenceType: "VACATION", plannedMinutes: 0 },
    });
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      noHolidays,
      FULL_PENSUM,
    );
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
    expect(result.vacationDaysDebit).toBe(5);
  });

  it("free-requested deducts from Zeitsaldo (Soll - Ist = -Tagessoll)", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "ABSENCE", absenceType: "FREE_REQUESTED", plannedMinutes: 0 },
      [days[1].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[2].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[3].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[4].iso]: { kind: "SHIFT", plannedMinutes: 504 },
    });
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      noHolidays,
      FULL_PENSUM,
    );
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(-504);
    expect(result.vacationDaysDebit).toBe(0);
  });

  it("simple TZT day is anrechenbar — zero Zeitsaldo impact, no auto TZT debit", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "ABSENCE", absenceType: "TZT", plannedMinutes: 0 },
      [days[1].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[2].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[3].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[4].iso]: { kind: "SHIFT", plannedMinutes: 504 },
    });
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      noHolidays,
      FULL_PENSUM,
    );
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
    expect(result.vacationDaysDebit).toBe(0);
  });

  it("TZT in TARGET_REDUCTION reduces Soll instead of crediting Ist", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "ABSENCE", absenceType: "TZT", plannedMinutes: 0 },
      [days[1].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[2].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[3].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[4].iso]: { kind: "SHIFT", plannedMinutes: 504 },
    });
    const result = computeWeeklyBalance(YEAR, WEEK, entries, noHolidays, {
      ...FULL_PENSUM,
      tztModel: "TARGET_REDUCTION",
    });
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
    expect(result.totalSollMinutes).toBe(2016);
    expect(result.totalIstMinutes).toBe(2016);
  });

  it("unpaid leave reduces Soll to 0 — no contribution either way", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "ABSENCE", absenceType: "UNPAID", plannedMinutes: 0 },
      [days[1].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[2].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[3].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[4].iso]: { kind: "SHIFT", plannedMinutes: 504 },
    });
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      noHolidays,
      FULL_PENSUM,
    );
    // Soll: Mon=0, Tue-Fri=4×504, weekend=0 → 2016. Ist: 4×504. Delta = 0.
    expect(result.totalSollMinutes).toBe(2016);
    expect(result.totalIstMinutes).toBe(2016);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
  });

  it("treats holidays as Soll=0 and ignores any vacation entry on that day", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const holidays = buildHolidayLookup([
      { date: new Date(`${days[0].iso}T00:00:00Z`), name: "Test Holiday" },
    ]);
    const entries = asEntries({
      [days[0].iso]: { kind: "ABSENCE", absenceType: "VACATION", plannedMinutes: 0 },
      [days[1].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[2].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[3].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[4].iso]: { kind: "SHIFT", plannedMinutes: 504 },
    });
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      holidays,
      FULL_PENSUM,
    );
    // Mon collapsed to HOLIDAY → Soll 0, Ist 0. Vacation count must be 0 — the
    // employee shouldn't lose a vacation day because it fell on a public
    // holiday.
    expect(result.days[0].kind).toBe("HOLIDAY");
    expect(result.vacationDaysDebit).toBe(0);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
  });

  it("missing weekday entries leave a negative delta (employee was scheduled but did nothing)", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[1].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      // Wed/Thu/Fri intentionally missing → counted as EMPTY_WEEKDAY
    });
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      noHolidays,
      FULL_PENSUM,
    );
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(2 * 504 - 2520);
  });
});

describe("computeWeeklyBalance — partial pensum", () => {
  it("60% pensum (1512 min) balances 0 when working three 504-min shifts", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[2].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[4].iso]: { kind: "SHIFT", plannedMinutes: 504 },
    });
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      noHolidays,
      { weeklyTargetMinutes: 1512, hazMinutesPerWeek: 2700 },
    );
    expect(result.totalSollMinutes).toBe(1512);
    expect(result.totalIstMinutes).toBe(1512);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
  });
});
