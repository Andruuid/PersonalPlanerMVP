import { describe, expect, it } from "vitest";
import { archiveUntil, ARCHIVE_RETENTION_YEARS } from "../archive";

describe("archiveUntil", () => {
  it("returns date + 10 years by default policy", () => {
    const base = new Date("2026-04-27T00:00:00.000Z");
    const archived = archiveUntil(base);
    expect(archived.toISOString()).toBe("2036-04-27T00:00:00.000Z");
    expect(ARCHIVE_RETENTION_YEARS).toBe(10);
  });
});
