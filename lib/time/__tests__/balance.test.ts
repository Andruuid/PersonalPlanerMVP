import { describe, expect, it } from "vitest";
import { computeWeeklyBalance, type PlanEntryByDate } from "../balance";
import { buildHolidayLookup } from "../holidays";
import { isoWeekDays } from "../week";

const noHolidays = buildHolidayLookup([]);

const FULL_PENSUM = {
  weeklyTargetMinutes: 2520, // 100% pensum, 42h
  hazMinutesPerWeek: 2700, // 45h
  standardWorkDays: 5,
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
    expect(result.totalHolidayCreditMinutes).toBe(0);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
    expect(result.weeklyWorkMinutes).toBe(2520);
    expect(result.weeklyUesAusweisMinutes).toBe(0);
    expect(result.weeklyUezDeltaMinutes).toBe(0);
    expect(result.vacationDaysDebit).toBe(0);
  });

  it("caps Zeitsaldo at HAZ and books only the excess into UEZ", () => {
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
    // Weekend work now has normal daily Soll: 6 × 504 = 3024.
    // Ist = 5 × 600 + 360 = 3360.
    expect(result.totalSollMinutes).toBe(3024);
    expect(result.totalIstMinutes).toBe(3360);
    expect(result.totalHolidayCreditMinutes).toBe(0);
    // Zeitsaldo sees only work up to HAZ: 2700 - 3024 = -324
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(-324);
    expect(result.weeklyWorkMinutes).toBe(3360);
    // UES capped at HAZ: max(0, 2700 - 3024) = 0
    expect(result.weeklyUesAusweisMinutes).toBe(0);
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
    expect(result.totalHolidayCreditMinutes).toBe(0);
    expect(result.vacationDaysDebit).toBe(5);
  });

  it("UEZ_BEZUG leaves weekly Zeitsaldo delta at 0 (full Soll, anrechenbar Ist)", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "ABSENCE", absenceType: "UEZ_BEZUG", plannedMinutes: 0 },
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
    expect(result.totalHolidayCreditMinutes).toBe(0);
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
    expect(result.totalHolidayCreditMinutes).toBe(0);
    expect(result.vacationDaysDebit).toBe(0);
    expect(result.parentalCareDaysDebit).toBe(0);
  });

  it("resolves SICK over TZT on the same day (no TZT effect)", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "ABSENCE", absenceType: "TZT", plannedMinutes: 0 },
      [days[1].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[2].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[3].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[4].iso]: { kind: "SHIFT", plannedMinutes: 504 },
    });
    entries.push({
      date: days[0].iso,
      kind: "ABSENCE",
      absenceType: "SICK",
      plannedMinutes: 0,
    });

    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      noHolidays,
      FULL_PENSUM,
    );
    expect(result.days[0].kind).toBe("SICK");
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
    expect(result.vacationDaysDebit).toBe(0);
    expect(result.parentalCareDaysDebit).toBe(0);
  });

  it("parental/care leave is anrechenbar and debits its own day counter", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: {
        kind: "ABSENCE",
        absenceType: "PARENTAL_CARE",
        plannedMinutes: 0,
      },
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
    expect(result.parentalCareDaysDebit).toBe(1);
  });

  it("military/civil service fulfills day soll on normal weekdays", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: {
        kind: "ABSENCE",
        absenceType: "MILITARY_SERVICE",
        plannedMinutes: 0,
      },
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
  });

  it("VFT is a planning-only day with no account impact", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const entries = asEntries({
      [days[0].iso]: { kind: "VFT", plannedMinutes: 0 },
      [days[1].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[2].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[3].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[4].iso]: { kind: "SHIFT", plannedMinutes: 504 },
      [days[5].iso]: { kind: "SHIFT", plannedMinutes: 504 },
    });
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      noHolidays,
      FULL_PENSUM,
    );
    expect(result.days[0].kind).toBe("VFT");
    expect(result.days[0].sollMinutes).toBe(0);
    expect(result.days[0].istMinutes).toBe(0);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
    expect(result.weeklyUesAusweisMinutes).toBe(0);
    expect(result.vacationDaysDebit).toBe(0);
    expect(result.parentalCareDaysDebit).toBe(0);
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
    expect(result.totalHolidayCreditMinutes).toBe(0);
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
    expect(result.totalHolidayCreditMinutes).toBe(0);
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
    // Mon collapsed to HOLIDAY → Soll 0, Ist 0, but holiday credit is surfaced
    // separately for UI/details. Vacation count must be 0 — the
    // employee shouldn't lose a vacation day because it fell on a public
    // holiday.
    expect(result.days[0].kind).toBe("HOLIDAY");
    expect(result.days[0].holidayCreditMinutes).toBe(504);
    expect(result.totalHolidayCreditMinutes).toBe(504);
    expect(result.vacationDaysDebit).toBe(0);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
  });

  it("handles holiday work <= 5h with equal compensation minutes", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const holidays = buildHolidayLookup([
      { date: new Date(`${days[0].iso}T00:00:00Z`), name: "Test Holiday" },
    ]);
    const entries = asEntries({
      [days[0].iso]: { kind: "SHIFT", plannedMinutes: 300 },
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

    expect(result.days[0].kind).toBe("HOLIDAY_WORK");
    expect(result.holidayWorkMinutes).toBe(300);
    expect(result.holidayCompensationMinutes).toBe(300);
    expect(result.holidayErtOpen).toBe(false);
  });

  it("opens ERT for holiday work > 5h without compensation minutes", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const holidays = buildHolidayLookup([
      { date: new Date(`${days[0].iso}T00:00:00Z`), name: "Test Holiday" },
    ]);
    const entries = asEntries({
      [days[0].iso]: { kind: "SHIFT", plannedMinutes: 360 },
    });
    const result = computeWeeklyBalance(
      YEAR,
      WEEK,
      entries,
      holidays,
      FULL_PENSUM,
    );

    expect(result.days[0].kind).toBe("HOLIDAY_WORK");
    expect(result.holidayWorkMinutes).toBe(360);
    expect(result.holidayCompensationMinutes).toBe(0);
    expect(result.holidayErtOpen).toBe(true);
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
    expect(result.totalHolidayCreditMinutes).toBe(0);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(2 * 504 - 2520);
  });

  it("uses tenant-equivalent standardWorkDays=4 (employee ohne Override)", () => {
    const days = isoWeekDays(YEAR, WEEK);
    const daily = 2520 / 4;
    const entries = asEntries(
      Object.fromEntries(
        days
          .slice(0, 5)
          .map((d) => [d.iso, { kind: "SHIFT", plannedMinutes: daily }]),
      ),
    );
    const result = computeWeeklyBalance(YEAR, WEEK, entries, noHolidays, {
      weeklyTargetMinutes: 2520,
      hazMinutesPerWeek: 3600,
      standardWorkDays: 4,
    });
    expect(result.totalSollMinutes).toBe(5 * daily);
    expect(result.totalIstMinutes).toBe(5 * daily);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
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
      { weeklyTargetMinutes: 1512, hazMinutesPerWeek: 2700, standardWorkDays: 5 },
    );
    expect(result.totalSollMinutes).toBe(1512);
    expect(result.totalIstMinutes).toBe(1512);
    expect(result.totalHolidayCreditMinutes).toBe(0);
    expect(result.weeklyZeitsaldoDeltaMinutes).toBe(0);
  });
});
