import { describe, expect, it } from "vitest";
import { formatAccountValue } from "@/components/admin/accounts/format";

describe("Ferien formatting", () => {
  it("formats Ferien minutes as days and hours", () => {
    const formatted = formatAccountValue("MINUTES", 2520, {
      accountType: "FERIEN",
      baseDailyMinutes: 504,
    });
    expect(formatted).toBe("+5.0 Tage (42.0 h)");
  });

  it("falls back to HH:MM when base daily minutes are missing", () => {
    const formatted = formatAccountValue("MINUTES", 2520, {
      accountType: "FERIEN",
      baseDailyMinutes: 0,
    });
    expect(formatted).toBe("+42:00");
  });
});
