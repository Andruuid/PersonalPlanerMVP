import { describe, expect, it } from "vitest";
import { planYearRollover } from "../year-rollover";

describe("planYearRollover", () => {
  it("rolls Zeitsaldo forward 1:1 with opening 0", () => {
    const plan = planYearRollover({
      accountType: "ZEITSALDO",
      unit: "MINUTES",
      closingValue: 540, // +9h carry forward
    });
    expect(plan.newYearOpening).toBe(0);
    expect(plan.carryoverBooking).toBe(540);
  });

  it("rolls UEZ forward 1:1 with opening 0", () => {
    const plan = planYearRollover({
      accountType: "UEZ",
      unit: "MINUTES",
      closingValue: 1800,
    });
    expect(plan.newYearOpening).toBe(0);
    expect(plan.carryoverBooking).toBe(1800);
  });

  it("Ferien rollover keeps opening = annual allowance and carries the rest as a booking", () => {
    const plan = planYearRollover({
      accountType: "FERIEN",
      unit: "MINUTES",
      closingValue: 2268,
      annualAllowance: 12600,
    });
    expect(plan.newYearOpening).toBe(12600);
    expect(plan.carryoverBooking).toBe(2268);
  });

  it("Ferien rollover with no allowance still carries the closing value", () => {
    const plan = planYearRollover({
      accountType: "FERIEN",
      unit: "MINUTES",
      closingValue: 1512,
    });
    expect(plan.newYearOpening).toBe(0);
    expect(plan.carryoverBooking).toBe(1512);
  });

  it("TZT carries forward 1:1 (manual-only)", () => {
    const plan = planYearRollover({
      accountType: "TZT",
      unit: "DAYS",
      closingValue: 1.5,
    });
    expect(plan.newYearOpening).toBe(0);
    expect(plan.carryoverBooking).toBe(1.5);
  });

  it("Sunday/holiday compensation carries forward 1:1 with opening 0", () => {
    const plan = planYearRollover({
      accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
      unit: "MINUTES",
      closingValue: 240,
    });
    expect(plan.newYearOpening).toBe(0);
    expect(plan.carryoverBooking).toBe(240);
  });

  it("parental/care leave carries forward 1:1 with opening 0", () => {
    const plan = planYearRollover({
      accountType: "PARENTAL_CARE",
      unit: "DAYS",
      closingValue: 2,
    });
    expect(plan.newYearOpening).toBe(0);
    expect(plan.carryoverBooking).toBe(2);
  });

  it("supports a negative Zeitsaldo carryover", () => {
    const plan = planYearRollover({
      accountType: "ZEITSALDO",
      unit: "MINUTES",
      closingValue: -180,
    });
    expect(plan.carryoverBooking).toBe(-180);
  });
});
