import { describe, expect, it } from "vitest";
import { evaluateRequestEntitlement } from "@/lib/requests/entitlement";
import { parseIsoDate } from "@/lib/time/week";

describe("evaluateRequestEntitlement", () => {
  it("rejects vacation requests when yearly ferie balance is too low", () => {
    const result = evaluateRequestEntitlement({
      type: "VACATION",
      startDate: parseIsoDate("2026-03-02")!,
      endDate: parseIsoDate("2026-03-06")!,
      weeklyTargetMinutes: 2520,
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { FERIEN: 3 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Ferienguthaben");
  });

  it("rejects tzt requests when yearly tzt balance is too low", () => {
    const result = evaluateRequestEntitlement({
      type: "TZT",
      startDate: parseIsoDate("2026-03-02")!,
      endDate: parseIsoDate("2026-03-03")!,
      weeklyTargetMinutes: 2520,
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { TZT: 1 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("TZT-Guthaben");
  });

  it("rejects free-requested when zeitsaldo minutes are insufficient", () => {
    const result = evaluateRequestEntitlement({
      type: "FREE_REQUESTED",
      startDate: parseIsoDate("2026-03-02")!,
      endDate: parseIsoDate("2026-03-03")!,
      weeklyTargetMinutes: 2520,
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { ZEITSALDO: 400 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Zeitsaldo");
  });

  it("uses annual vacation allowance default when no ferie balance row exists", () => {
    const result = evaluateRequestEntitlement({
      type: "VACATION",
      startDate: parseIsoDate("2026-03-02")!,
      endDate: parseIsoDate("2026-03-06")!,
      weeklyTargetMinutes: 2520,
      vacationDaysPerYear: 25,
      balancesByYear: {},
    });

    expect(result.ok).toBe(true);
  });

  it("allows requests that fit balances across year boundaries", () => {
    const result = evaluateRequestEntitlement({
      type: "VACATION",
      startDate: parseIsoDate("2026-12-31")!,
      endDate: parseIsoDate("2027-01-01")!,
      weeklyTargetMinutes: 2520,
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { FERIEN: 1 },
        2027: { FERIEN: 1 },
      },
    });

    expect(result.ok).toBe(true);
  });
});
