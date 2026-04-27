import { describe, expect, it } from "vitest";
import { buildHolidayLookup } from "../holidays";

describe("buildHolidayLookup", () => {
  it("returns false for unknown dates", () => {
    const lookup = buildHolidayLookup([]);
    expect(lookup.has("2026-08-01")).toBe(false);
    expect(lookup.nameOf("2026-08-01")).toBeNull();
  });

  it("matches known holidays by ISO date", () => {
    const lookup = buildHolidayLookup([
      { date: new Date(Date.UTC(2026, 7, 1)), name: "Bundesfeier" },
      { date: new Date(Date.UTC(2026, 11, 25)), name: "Weihnachten" },
    ]);
    expect(lookup.has("2026-08-01")).toBe(true);
    expect(lookup.nameOf("2026-08-01")).toBe("Bundesfeier");
    expect(lookup.has("2026-12-25")).toBe(true);
    expect(lookup.nameOf("2026-12-25")).toBe("Weihnachten");
    expect(lookup.has("2026-12-26")).toBe(false);
  });
});
