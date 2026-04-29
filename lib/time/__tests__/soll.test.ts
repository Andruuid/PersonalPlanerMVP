import { describe, expect, it } from "vitest";
import {
  anrechenbarIstMinutes,
  baseDailySollMinutes,
  dailySollMinutes,
} from "../soll";

const STD_DAYS = 5;

describe("baseDailySollMinutes", () => {
  it("splits 100% pensum (42h/week) evenly across five workdays", () => {
    expect(baseDailySollMinutes(2520, STD_DAYS)).toBe(2520 / 5);
  });

  it("scales linearly with pensum via weeklyTargetMinutes", () => {
    expect(baseDailySollMinutes(1512, STD_DAYS)).toBe(1512 / 5); // 60% pensum
    expect(baseDailySollMinutes(1008, STD_DAYS)).toBe(1008 / 5); // 40% pensum
  });

  it("returns 0 if standardWorkDays is 0 to avoid NaN", () => {
    expect(baseDailySollMinutes(2520, 0)).toBe(0);
  });

  it("respects the standardWorkDays override", () => {
    expect(baseDailySollMinutes(2400, 6)).toBe(400);
  });
});

describe("dailySollMinutes", () => {
  it("returns 0 for holiday/day-off and UNPAID kinds", () => {
    expect(dailySollMinutes("HOLIDAY", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(0);
    expect(dailySollMinutes("HOLIDAY_WORK", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(
      0,
    );
    expect(dailySollMinutes("WEEKEND_OFF", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(
      0,
    );
    expect(dailySollMinutes("UNPAID", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(0);
    expect(dailySollMinutes("VFT", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(0);
  });

  it("returns base Soll for work (including weekend work), service/absence kinds, and empty weekday", () => {
    const base = 2520 / STD_DAYS;
    expect(dailySollMinutes("WORK", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(base);
    expect(dailySollMinutes("WORK_ON_WEEKEND", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(
      base,
    );
    expect(dailySollMinutes("SICK", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(base);
    expect(dailySollMinutes("ACCIDENT", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(base);
    expect(dailySollMinutes("VACATION", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(base);
    expect(dailySollMinutes("PARENTAL_CARE", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(
      base,
    );
    expect(dailySollMinutes("SERVICE", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(base);
    expect(dailySollMinutes("TZT_ABSENCE", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(
      base,
    );
    expect(dailySollMinutes("UEZ_BEZUG", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(
      base,
    );
    expect(dailySollMinutes("FREE_REQUESTED", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(
      base,
    );
    expect(dailySollMinutes("EMPTY_WEEKDAY", 2520, "DAILY_QUOTA", STD_DAYS)).toBe(
      base,
    );
  });

  it("uses standardWorkDays=4 for higher Tagessoll (weekly ÷ 4)", () => {
    expect(dailySollMinutes("WORK", 2520, "DAILY_QUOTA", 4)).toBe(630);
  });

  it("TZT_ABSENCE + TARGET_REDUCTION (Legacy): Tagessoll wie EMPTY_WEEKDAY, nicht zusätzliche Reduktion auf 0", () => {
    const base = 2520 / STD_DAYS;
    expect(dailySollMinutes("TZT_ABSENCE", 2520, "TARGET_REDUCTION", STD_DAYS)).toBe(
      base,
    );
  });
});

describe("anrechenbarIstMinutes", () => {
  const weekly = 2520;
  const base = weekly / STD_DAYS;

  it("returns plannedMinutes for normal work and weekend work", () => {
    expect(anrechenbarIstMinutes("WORK", 480, weekly, "DAILY_QUOTA", STD_DAYS)).toBe(
      480,
    );
    expect(
      anrechenbarIstMinutes("WORK_ON_WEEKEND", 360, weekly, "DAILY_QUOTA", STD_DAYS),
    ).toBe(360);
    expect(
      anrechenbarIstMinutes("HOLIDAY_WORK", 240, weekly, "DAILY_QUOTA", STD_DAYS),
    ).toBe(240);
  });

  it("credits Tagessoll back as Ist for neutral absence kinds", () => {
    expect(anrechenbarIstMinutes("SICK", 0, weekly, "DAILY_QUOTA", STD_DAYS)).toBe(
      base,
    );
    expect(
      anrechenbarIstMinutes("ACCIDENT", 0, weekly, "DAILY_QUOTA", STD_DAYS),
    ).toBe(base);
    expect(
      anrechenbarIstMinutes("VACATION", 0, weekly, "DAILY_QUOTA", STD_DAYS),
    ).toBe(base);
    expect(
      anrechenbarIstMinutes("PARENTAL_CARE", 0, weekly, "DAILY_QUOTA", STD_DAYS),
    ).toBe(base);
    expect(anrechenbarIstMinutes("SERVICE", 0, weekly, "DAILY_QUOTA", STD_DAYS)).toBe(
      base,
    );
    expect(
      anrechenbarIstMinutes("TZT_ABSENCE", 0, weekly, "DAILY_QUOTA", STD_DAYS),
    ).toBe(base);
    expect(
      anrechenbarIstMinutes("UEZ_BEZUG", 0, weekly, "DAILY_QUOTA", STD_DAYS),
    ).toBe(base);
  });

  it("TZT_ABSENCE + TARGET_REDUCTION (Legacy): kein Ist wie EMPTY_WEEKDAY", () => {
    expect(
      anrechenbarIstMinutes("TZT_ABSENCE", 0, weekly, "TARGET_REDUCTION", STD_DAYS),
    ).toBe(0);
    expect(
      anrechenbarIstMinutes("EMPTY_WEEKDAY", 0, weekly, "TARGET_REDUCTION", STD_DAYS),
    ).toBe(0);
  });

  it("returns 0 Ist for HOLIDAY/WEEKEND_OFF/UNPAID/FREE_REQUESTED/EMPTY_WEEKDAY", () => {
    expect(anrechenbarIstMinutes("HOLIDAY", 0, weekly, "DAILY_QUOTA", STD_DAYS)).toBe(
      0,
    );
    expect(
      anrechenbarIstMinutes("WEEKEND_OFF", 0, weekly, "DAILY_QUOTA", STD_DAYS),
    ).toBe(0);
    expect(anrechenbarIstMinutes("UNPAID", 0, weekly, "DAILY_QUOTA", STD_DAYS)).toBe(
      0,
    );
    expect(anrechenbarIstMinutes("VFT", 0, weekly, "DAILY_QUOTA", STD_DAYS)).toBe(0);
    expect(
      anrechenbarIstMinutes("FREE_REQUESTED", 0, weekly, "DAILY_QUOTA", STD_DAYS),
    ).toBe(0);
    expect(
      anrechenbarIstMinutes("EMPTY_WEEKDAY", 0, weekly, "DAILY_QUOTA", STD_DAYS),
    ).toBe(0);
  });

  it("half-day off: 50% pensum → ist = soll = base/2, contribution 0 (ignores display 240)", () => {
    const weeklyTarget50 = 21 * 60; // 50% of 42h
    const base = baseDailySollMinutes(weeklyTarget50, STD_DAYS);
    const half = base / 2;
    expect(dailySollMinutes("HALF_DAY_OFF", weeklyTarget50, "DAILY_QUOTA", STD_DAYS)).toBe(
      half,
    );
    const ist = anrechenbarIstMinutes(
      "HALF_DAY_OFF",
      240,
      weeklyTarget50,
      "DAILY_QUOTA",
      STD_DAYS,
    );
    expect(ist).toBe(126);
    expect(ist).toBe(half);
    expect(ist - half).toBe(0);
  });
});
