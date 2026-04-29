import { describe, expect, it } from "vitest";
import { isIsoWeekSundayBeforeToday } from "../week";

describe("isIsoWeekSundayBeforeToday", () => {
  it("is false when today is on the weeks Sunday", () => {
    const sundayJan7 = new Date(2024, 0, 7); // So · KW 1 / 2024 in CH locale calendar
    expect(isIsoWeekSundayBeforeToday(2024, 1, sundayJan7)).toBe(false);
  });

  it("is true when the weeks Sunday was yesterday", () => {
    const mondayJan8 = new Date(2024, 0, 8);
    expect(isIsoWeekSundayBeforeToday(2024, 1, mondayJan8)).toBe(true);
  });
});
