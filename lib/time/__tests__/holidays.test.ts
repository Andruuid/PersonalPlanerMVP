import { describe, expect, it } from "vitest";
import { buildHolidayLookup } from "../holidays";
import {
  holidaysForCatholic,
  holidaysForReformed,
  holidaysForRegion,
} from "../../holidays-ch";

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

function names(defs: { name: string }[]): string[] {
  return defs.map((d) => d.name);
}

describe("holidaysForReformed", () => {
  it("includes the federal holidays plus 1. August", () => {
    const list = names(holidaysForReformed(2026));
    expect(list).toContain("Bundesfeier");
    expect(list).toContain("Karfreitag");
    expect(list).toContain("Neujahr");
    expect(list).toContain("Auffahrt");
    expect(list).toContain("Weihnachten");
  });

  it("excludes the Catholic feast days", () => {
    const list = names(holidaysForReformed(2026));
    expect(list).not.toContain("Fronleichnam");
    expect(list).not.toContain("Mariä Himmelfahrt");
    expect(list).not.toContain("Allerheiligen");
    expect(list).not.toContain("Mariä Empfängnis");
  });
});

describe("holidaysForCatholic", () => {
  it("includes the federal holidays plus 1. August", () => {
    const list = names(holidaysForCatholic(2026));
    expect(list).toContain("Bundesfeier");
    expect(list).toContain("Karfreitag");
    expect(list).toContain("Neujahr");
  });

  it("includes the Catholic feast days", () => {
    const list = names(holidaysForCatholic(2026));
    expect(list).toContain("Fronleichnam");
    expect(list).toContain("Mariä Himmelfahrt");
    expect(list).toContain("Allerheiligen");
    expect(list).toContain("Mariä Empfängnis");
  });
});

describe("holidaysForRegion", () => {
  it("maps EVANGELISCH to the Reformed set", () => {
    const list = names(holidaysForRegion("EVANGELISCH", 2026));
    expect(list).toContain("Bundesfeier");
    expect(list).not.toContain("Fronleichnam");
  });

  it("maps KATHOLISCH to the Catholic set", () => {
    const list = names(holidaysForRegion("KATHOLISCH", 2026));
    expect(list).toContain("Bundesfeier");
    expect(list).toContain("Fronleichnam");
  });

  it("keeps legacy canton codes working (LU/BE/BS → Catholic, ZH → Reformed)", () => {
    expect(names(holidaysForRegion("LU", 2026))).toContain("Fronleichnam");
    expect(names(holidaysForRegion("BE", 2026))).toContain("Fronleichnam");
    expect(names(holidaysForRegion("BS", 2026))).toContain("Fronleichnam");
    expect(names(holidaysForRegion("ZH", 2026))).not.toContain("Fronleichnam");
  });

  it("throws on unknown region codes instead of silently falling back", () => {
    expect(() => holidaysForRegion("XYZ", 2026)).toThrow(/XYZ/);
  });
});
