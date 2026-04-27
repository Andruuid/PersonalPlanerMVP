import { describe, expect, it } from "vitest";
import { vacationDaysDebit } from "../vacation";

describe("vacationDaysDebit", () => {
  it("counts only VACATION days", () => {
    expect(
      vacationDaysDebit([
        { kind: "VACATION" },
        { kind: "VACATION" },
        { kind: "WEEKEND_OFF" },
        { kind: "HOLIDAY" }, // priority would have collapsed a vacation-on-holiday
        { kind: "WORK" },
      ]),
    ).toBe(2);
  });

  it("returns 0 if there is no vacation in the week", () => {
    expect(
      vacationDaysDebit([
        { kind: "WORK" },
        { kind: "SICK" },
        { kind: "HOLIDAY" },
      ]),
    ).toBe(0);
  });
});
