import { describe, expect, it } from "vitest";
import { resolveDay } from "../priority";

describe("resolveDay", () => {
  it("treats holidays as HOLIDAY regardless of plan entry", () => {
    expect(resolveDay(null, true, false).kind).toBe("HOLIDAY");
    expect(
      resolveDay(
        { kind: "ABSENCE", absenceType: "VACATION", plannedMinutes: 0 },
        true,
        false,
      ).kind,
    ).toBe("HOLIDAY");
    expect(
      resolveDay(
        { kind: "SHIFT", plannedMinutes: 480 },
        true,
        false,
      ).kind,
    ).toBe("HOLIDAY");
  });

  it("returns WEEKEND_OFF on weekends with no shift", () => {
    expect(resolveDay(null, false, true).kind).toBe("WEEKEND_OFF");
    expect(
      resolveDay(
        { kind: "ABSENCE", absenceType: "VACATION", plannedMinutes: 0 },
        false,
        true,
      ).kind,
    ).toBe("WEEKEND_OFF");
  });

  it("returns WORK_ON_WEEKEND when a shift is scheduled on a weekend", () => {
    const r = resolveDay(
      { kind: "SHIFT", plannedMinutes: 480 },
      false,
      true,
    );
    expect(r.kind).toBe("WORK_ON_WEEKEND");
    expect(r.plannedMinutes).toBe(480);
  });

  it("returns EMPTY_WEEKDAY when no entry on a weekday", () => {
    expect(resolveDay(null, false, false).kind).toBe("EMPTY_WEEKDAY");
  });

  it("propagates absence types to specific kinds", () => {
    const map = [
      ["VACATION", "VACATION"],
      ["SICK", "SICK"],
      ["ACCIDENT", "ACCIDENT"],
      ["FREE_REQUESTED", "FREE_REQUESTED"],
      ["UNPAID", "UNPAID"],
      ["TZT", "TZT_ABSENCE"],
      ["HOLIDAY_AUTO", "HOLIDAY"],
    ] as const;
    for (const [absence, kind] of map) {
      const r = resolveDay(
        { kind: "ABSENCE", absenceType: absence, plannedMinutes: 0 },
        false,
        false,
      );
      expect(r.kind).toBe(kind);
    }
  });

  it("returns WORK with plannedMinutes for shifts on weekdays", () => {
    const r = resolveDay(
      { kind: "ONE_TIME_SHIFT", plannedMinutes: 270 },
      false,
      false,
    );
    expect(r.kind).toBe("WORK");
    expect(r.plannedMinutes).toBe(270);
  });
});
