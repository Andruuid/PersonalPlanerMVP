import { describe, expect, it } from "vitest";
import { isoDateString, parseIsoDate } from "../week";

describe("isoDateString", () => {
  it("round-trips with parseIsoDate for the same calendar day", () => {
    const s = "2024-06-15";
    const d = parseIsoDate(s);
    expect(d).not.toBeNull();
    expect(isoDateString(d!)).toBe(s);
  });
});
