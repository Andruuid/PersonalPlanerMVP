import { describe, expect, it } from "vitest";
import { hasRestWindowMinutes } from "../ert";

describe("hasRestWindowMinutes", () => {
  it("returns true when a 35h gap exists", () => {
    const start = new Date("2026-01-01T00:00:00");
    const end = new Date("2026-01-05T00:00:00");
    const intervals = [
      {
        start: new Date("2026-01-01T08:00:00"),
        end: new Date("2026-01-01T17:00:00"),
      },
      {
        start: new Date("2026-01-03T12:00:00"),
        end: new Date("2026-01-03T20:00:00"),
      },
    ];

    expect(hasRestWindowMinutes(intervals, start, end, 35 * 60)).toBe(true);
  });

  it("returns false when all rest windows are shorter than 35h", () => {
    const start = new Date("2026-01-01T00:00:00");
    const end = new Date("2026-01-03T00:00:00");
    const intervals = [
      {
        start: new Date("2026-01-01T06:00:00"),
        end: new Date("2026-01-01T20:00:00"),
      },
      {
        start: new Date("2026-01-02T08:00:00"),
        end: new Date("2026-01-02T22:00:00"),
      },
    ];

    expect(hasRestWindowMinutes(intervals, start, end, 35 * 60)).toBe(false);
  });
});
