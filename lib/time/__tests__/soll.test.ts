import { describe, expect, it } from "vitest";
import {
  STANDARD_WORK_DAYS,
  anrechenbarIstMinutes,
  baseDailySollMinutes,
  dailySollMinutes,
} from "../soll";

describe("baseDailySollMinutes", () => {
  it("splits 100% pensum (42h/week) evenly across five workdays", () => {
    expect(baseDailySollMinutes(2520)).toBe(2520 / 5);
  });

  it("scales linearly with pensum via weeklyTargetMinutes", () => {
    expect(baseDailySollMinutes(1512)).toBe(1512 / 5); // 60% pensum
    expect(baseDailySollMinutes(1008)).toBe(1008 / 5); // 40% pensum
  });

  it("returns 0 if standardWorkDays is 0 to avoid NaN", () => {
    expect(baseDailySollMinutes(2520, 0)).toBe(0);
  });

  it("respects the standardWorkDays override", () => {
    expect(baseDailySollMinutes(2400, 6)).toBe(400);
  });
});

describe("dailySollMinutes", () => {
  it("returns 0 for HOLIDAY, weekends, and UNPAID", () => {
    expect(dailySollMinutes("HOLIDAY", 2520)).toBe(0);
    expect(dailySollMinutes("WEEKEND_OFF", 2520)).toBe(0);
    expect(dailySollMinutes("WORK_ON_WEEKEND", 2520)).toBe(0);
    expect(dailySollMinutes("UNPAID", 2520)).toBe(0);
  });

  it("returns base Soll for normal work, sick, accident, vacation, TZT, free-requested, empty weekday", () => {
    const base = 2520 / STANDARD_WORK_DAYS;
    expect(dailySollMinutes("WORK", 2520)).toBe(base);
    expect(dailySollMinutes("SICK", 2520)).toBe(base);
    expect(dailySollMinutes("ACCIDENT", 2520)).toBe(base);
    expect(dailySollMinutes("VACATION", 2520)).toBe(base);
    expect(dailySollMinutes("TZT_ABSENCE", 2520)).toBe(base);
    expect(dailySollMinutes("FREE_REQUESTED", 2520)).toBe(base);
    expect(dailySollMinutes("EMPTY_WEEKDAY", 2520)).toBe(base);
  });

  it("treats TZT as Soll-reduction in TARGET_REDUCTION model", () => {
    expect(dailySollMinutes("TZT_ABSENCE", 2520, "TARGET_REDUCTION")).toBe(0);
  });
});

describe("anrechenbarIstMinutes", () => {
  const weekly = 2520;
  const base = weekly / STANDARD_WORK_DAYS;

  it("returns plannedMinutes for normal work and weekend work", () => {
    expect(anrechenbarIstMinutes("WORK", 480, weekly)).toBe(480);
    expect(anrechenbarIstMinutes("WORK_ON_WEEKEND", 360, weekly)).toBe(360);
  });

  it("credits Tagessoll back as Ist for VACATION/SICK/ACCIDENT/TZT", () => {
    expect(anrechenbarIstMinutes("SICK", 0, weekly)).toBe(base);
    expect(anrechenbarIstMinutes("ACCIDENT", 0, weekly)).toBe(base);
    expect(anrechenbarIstMinutes("VACATION", 0, weekly)).toBe(base);
    expect(anrechenbarIstMinutes("TZT_ABSENCE", 0, weekly)).toBe(base);
  });

  it("does not credit TZT Ist in TARGET_REDUCTION model", () => {
    expect(anrechenbarIstMinutes("TZT_ABSENCE", 0, weekly, "TARGET_REDUCTION")).toBe(
      0,
    );
  });

  it("returns 0 Ist for HOLIDAY/WEEKEND_OFF/UNPAID/FREE_REQUESTED/EMPTY_WEEKDAY", () => {
    expect(anrechenbarIstMinutes("HOLIDAY", 0, weekly)).toBe(0);
    expect(anrechenbarIstMinutes("WEEKEND_OFF", 0, weekly)).toBe(0);
    expect(anrechenbarIstMinutes("UNPAID", 0, weekly)).toBe(0);
    expect(anrechenbarIstMinutes("FREE_REQUESTED", 0, weekly)).toBe(0);
    expect(anrechenbarIstMinutes("EMPTY_WEEKDAY", 0, weekly)).toBe(0);
  });
});
