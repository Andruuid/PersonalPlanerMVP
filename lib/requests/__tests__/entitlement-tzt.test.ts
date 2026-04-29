import { describe, expect, it } from "vitest";
import { evaluateRequestEntitlement } from "@/lib/requests/entitlement";
import { parseIsoDate } from "@/lib/time/week";

const baseInput = {
  startDate: parseIsoDate("2026-03-02")!,
  endDate: parseIsoDate("2026-03-03")!,
  weeklyTargetMinutes: 2520,
  standardWorkDays: 5,
  vacationDaysPerYear: 25,
};

describe("evaluateRequestEntitlement — TZT vs TZT-Modell", () => {
  it("DAILY_QUOTA: prüft TZT-Guthaben", () => {
    const ok = evaluateRequestEntitlement({
      ...baseInput,
      type: "TZT",
      tztModel: "DAILY_QUOTA",
      balancesByYear: { 2026: { TZT: 5 } },
    });
    expect(ok).toEqual({ ok: true });

    const low = evaluateRequestEntitlement({
      ...baseInput,
      type: "TZT",
      tztModel: "DAILY_QUOTA",
      balancesByYear: { 2026: { TZT: 1 } },
    });
    expect(low.ok).toBe(false);
    expect(low.error).toContain("TZT-Guthaben");
  });

  it("TARGET_REDUCTION: TZT-Antrag immer abgelehnt (kein Kontingent-/Bezugsweg)", () => {
    const r = evaluateRequestEntitlement({
      ...baseInput,
      type: "TZT",
      tztModel: "TARGET_REDUCTION",
      balancesByYear: { 2026: { TZT: 99 } },
    });
    expect(r).toEqual({
      ok: false,
      error: "TZT-Bezug nicht vorgesehen (Modell Sollzeit-Reduktion).",
    });
  });

  it("TARGET_REDUCTION ohne explizites Modell (Default DAILY_QUOTA): weiterhin Kontingentpfad", () => {
    const r = evaluateRequestEntitlement({
      ...baseInput,
      type: "TZT",
      balancesByYear: { 2026: { TZT: 5 } },
    });
    expect(r.ok).toBe(true);
  });
});
