import { describe, expect, it } from "vitest";
import {
  WEEKDAY_BITS,
  bitmaskFromWeekdayIndices,
  bitmaskHasWeekday,
  hasCoverageRequirement,
  isUnderstaffed,
  weekdayIndicesFromBitmask,
} from "@/lib/services/coverage";

describe("service-template coverage helpers", () => {
  it("WEEKDAY_BITS uses the spec convention Mo=1..So=64", () => {
    expect(WEEKDAY_BITS).toEqual([1, 2, 4, 8, 16, 32, 64]);
  });

  it("round-trips between bitmask and indices", () => {
    // Mo + Mi + Fr = 1 + 4 + 16 = 21
    const mask = bitmaskFromWeekdayIndices([0, 2, 4]);
    expect(mask).toBe(21);
    expect(weekdayIndicesFromBitmask(mask)).toEqual([0, 2, 4]);
  });

  it("treats null/0 bitmask as no required weekdays", () => {
    expect(bitmaskHasWeekday(null, 0)).toBe(false);
    expect(bitmaskHasWeekday(0, 3)).toBe(false);
    expect(weekdayIndicesFromBitmask(null)).toEqual([]);
  });

  it("hasCoverageRequirement requires both bit + positive requiredCount", () => {
    // defaultDays = Mo|Mi|Fr = 21
    expect(
      hasCoverageRequirement({ defaultDays: 21, requiredCount: 2 }, 0),
    ).toBe(true);
    // Tuesday is not in the mask
    expect(
      hasCoverageRequirement({ defaultDays: 21, requiredCount: 2 }, 1),
    ).toBe(false);
    // requiredCount missing → no requirement
    expect(
      hasCoverageRequirement({ defaultDays: 21, requiredCount: null }, 0),
    ).toBe(false);
    expect(
      hasCoverageRequirement({ defaultDays: 21, requiredCount: 0 }, 0),
    ).toBe(false);
  });

  it("isUnderstaffed flags days with too few planned entries", () => {
    const template = { defaultDays: 21, requiredCount: 2 };

    // Monday is required, only 1 entry → understaffed
    expect(isUnderstaffed(template, 0, 1)).toBe(true);
    expect(isUnderstaffed(template, 0, 0)).toBe(true);

    // Reaching the requirement is fine
    expect(isUnderstaffed(template, 0, 2)).toBe(false);
    expect(isUnderstaffed(template, 0, 5)).toBe(false);

    // Tuesday is not in the bitmask → never understaffed
    expect(isUnderstaffed(template, 1, 0)).toBe(false);
  });

  it("returns false when the template has no coverage requirement", () => {
    expect(
      isUnderstaffed({ defaultDays: null, requiredCount: 2 }, 0, 0),
    ).toBe(false);
    expect(
      isUnderstaffed({ defaultDays: 21, requiredCount: null }, 0, 0),
    ).toBe(false);
    expect(
      isUnderstaffed({ defaultDays: 0, requiredCount: 0 }, 0, 0),
    ).toBe(false);
  });
});
