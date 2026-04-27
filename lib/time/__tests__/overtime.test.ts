import { describe, expect, it } from "vitest";
import { actualWorkMinutes, weeklyUezContribution } from "../overtime";

describe("actualWorkMinutes", () => {
  it("only counts WORK and WORK_ON_WEEKEND days", () => {
    expect(
      actualWorkMinutes([
        { kind: "WORK", plannedMinutes: 480 },
        { kind: "WORK", plannedMinutes: 510 },
        { kind: "VACATION", plannedMinutes: 0 },
        { kind: "SICK", plannedMinutes: 0 },
        { kind: "WORK_ON_WEEKEND", plannedMinutes: 360 },
        { kind: "HOLIDAY", plannedMinutes: 0 },
      ]),
    ).toBe(480 + 510 + 360);
  });
});

describe("weeklyUezContribution", () => {
  it("returns 0 when work is below the HAZ", () => {
    expect(weeklyUezContribution(2400, 2700)).toBe(0);
    expect(weeklyUezContribution(2700, 2700)).toBe(0);
  });

  it("returns the excess minutes when over HAZ (45h or 50h cap)", () => {
    expect(weeklyUezContribution(2820, 2700)).toBe(120);
    expect(weeklyUezContribution(3120, 3000)).toBe(120);
  });
});
