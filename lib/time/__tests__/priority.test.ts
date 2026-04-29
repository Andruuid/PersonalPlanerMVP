import { describe, expect, it } from "vitest";
import { resolveDay, resolveDayFromEntries } from "../priority";

describe("resolveDay", () => {
  it("treats holidays as HOLIDAY when there is no holiday shift", () => {
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
    ).toBe("HOLIDAY_WORK");
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
      ["UEZ_BEZUG", "UEZ_BEZUG"],
      ["UNPAID", "UNPAID"],
      ["TZT", "TZT_ABSENCE"],
      ["PARENTAL_CARE", "PARENTAL_CARE"],
      ["MILITARY_SERVICE", "SERVICE"],
      ["CIVIL_PROTECTION_SERVICE", "SERVICE"],
      ["CIVIL_SERVICE", "SERVICE"],
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

  it("resolves VFT as dedicated planning day kind", () => {
    const r = resolveDay({ kind: "VFT", plannedMinutes: 0 }, false, false);
    expect(r.kind).toBe("VFT");
    expect(r.plannedMinutes).toBe(0);
  });

  it("resolves SICK over TZT when both absences are present", () => {
    const r = resolveDayFromEntries(
      [
        { kind: "ABSENCE", absenceType: "TZT", plannedMinutes: 0 },
        { kind: "ABSENCE", absenceType: "SICK", plannedMinutes: 0 },
      ],
      false,
      false,
    );
    expect(r.kind).toBe("SICK");
  });

  it("resolves ACCIDENT over TZT when both absences are present", () => {
    const r = resolveDayFromEntries(
      [
        { kind: "ABSENCE", absenceType: "TZT", plannedMinutes: 0 },
        { kind: "ABSENCE", absenceType: "ACCIDENT", plannedMinutes: 0 },
      ],
      false,
      false,
    );
    expect(r.kind).toBe("ACCIDENT");
  });

  it("prioritizes VACATION over TZT on the same weekday", () => {
    const r = resolveDayFromEntries(
      [
        { kind: "ABSENCE", absenceType: "TZT", plannedMinutes: 0 },
        { kind: "ABSENCE", absenceType: "VACATION", plannedMinutes: 0 },
      ],
      false,
      false,
    );
    expect(r.kind).toBe("VACATION");
  });

  it("prioritizes TZT over FREE_REQUESTED on the same weekday", () => {
    const r = resolveDayFromEntries(
      [
        { kind: "ABSENCE", absenceType: "FREE_REQUESTED", plannedMinutes: 0 },
        { kind: "ABSENCE", absenceType: "TZT", plannedMinutes: 0 },
      ],
      false,
      false,
    );
    expect(r.kind).toBe("TZT_ABSENCE");
  });

  it("prioritizes TZT over UEZ_BEZUG on the same weekday", () => {
    const r = resolveDayFromEntries(
      [
        { kind: "ABSENCE", absenceType: "UEZ_BEZUG", plannedMinutes: 0 },
        { kind: "ABSENCE", absenceType: "TZT", plannedMinutes: 0 },
      ],
      false,
      false,
    );
    expect(r.kind).toBe("TZT_ABSENCE");
  });

  it("prioritizes UEZ_BEZUG over FREE_REQUESTED on the same weekday", () => {
    const r = resolveDayFromEntries(
      [
        { kind: "ABSENCE", absenceType: "FREE_REQUESTED", plannedMinutes: 0 },
        { kind: "ABSENCE", absenceType: "UEZ_BEZUG", plannedMinutes: 0 },
      ],
      false,
      false,
    );
    expect(r.kind).toBe("UEZ_BEZUG");
  });

  it("prioritizes FREE_REQUESTED over UNPAID on the same weekday", () => {
    const r = resolveDayFromEntries(
      [
        { kind: "ABSENCE", absenceType: "UNPAID", plannedMinutes: 0 },
        { kind: "ABSENCE", absenceType: "FREE_REQUESTED", plannedMinutes: 0 },
      ],
      false,
      false,
    );
    expect(r.kind).toBe("FREE_REQUESTED");
  });
});
