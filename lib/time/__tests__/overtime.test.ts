import { describe, expect, it } from "vitest";
import {
  actualWorkMinutes,
  weeklyUesIndicator,
  weeklyUezContribution,
} from "../overtime";

describe("actualWorkMinutes", () => {
  it("counts all work kinds including holiday work", () => {
    expect(
      actualWorkMinutes([
        { kind: "WORK", plannedMinutes: 480 },
        { kind: "WORK", plannedMinutes: 510 },
        { kind: "VACATION", plannedMinutes: 0 },
        { kind: "SICK", plannedMinutes: 0 },
        { kind: "WORK_ON_WEEKEND", plannedMinutes: 360 },
        { kind: "HOLIDAY_WORK", plannedMinutes: 120 },
        { kind: "HOLIDAY", plannedMinutes: 0 },
      ]),
    ).toBe(480 + 510 + 360 + 120);
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

describe("weeklyUesIndicator", () => {
  it("returns 0 when weekly work is below or equal weekly Soll", () => {
    expect(weeklyUesIndicator(2400, 2520, 2700)).toBe(0);
    expect(weeklyUesIndicator(2520, 2520, 2700)).toBe(0);
  });

  it("returns work-minus-soll when work is between Soll and HAZ", () => {
    expect(weeklyUesIndicator(2640, 2520, 2700)).toBe(120);
  });

  it("caps at HAZ-minus-soll when work exceeds HAZ", () => {
    expect(weeklyUesIndicator(3000, 2520, 2700)).toBe(180);
  });
});
