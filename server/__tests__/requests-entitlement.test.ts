import { describe, expect, it } from "vitest";
import {
  evaluateRequestEntitlement,
  requestedSollDaysByYear,
} from "@/lib/requests/entitlement";
import { parseIsoDate } from "@/lib/time/week";

describe("requestedSollDaysByYear", () => {
  it("Mo–So Fenster: 5-Tage-Modell zählt Mo–Fr (5 Soll-Tage)", () => {
    const m = requestedSollDaysByYear(
      parseIsoDate("2026-03-02")!,
      parseIsoDate("2026-03-08")!,
      5,
      new Map(),
    );
    expect(m.get(2026)).toBe(5);
  });

  it("Mo–So Fenster: 6-Tage-Modell zählt Mo–Sa (6 Soll-Tage)", () => {
    const m = requestedSollDaysByYear(
      parseIsoDate("2026-03-02")!,
      parseIsoDate("2026-03-08")!,
      6,
      new Map(),
    );
    expect(m.get(2026)).toBe(6);
  });

  it("Mo–Fr: Montag feiertagsfrei ⇒ 4 Soll-Tage", () => {
    const holidays = new Map<number, Set<string>>([
      [2026, new Set(["2026-01-05"])],
    ]);
    const m = requestedSollDaysByYear(
      parseIsoDate("2026-01-05")!,
      parseIsoDate("2026-01-09")!,
      5,
      holidays,
    );
    expect(m.get(2026)).toBe(4);
  });

  it("Antrag liegt nur auf Feiertagen ⇒ 0 Soll-Tage (no-op)", () => {
    const holidays = new Map<number, Set<string>>([
      [2026, new Set(["2026-01-08"])],
    ]);
    const m = requestedSollDaysByYear(
      parseIsoDate("2026-01-08")!,
      parseIsoDate("2026-01-08")!,
      5,
      holidays,
    );
    expect(m.size).toBe(0);
  });
});

describe("evaluateRequestEntitlement", () => {
  it("rejects vacation requests when yearly ferie balance is too low", () => {
    const result = evaluateRequestEntitlement({
      type: "VACATION",
      startDate: parseIsoDate("2026-03-02")!,
      endDate: parseIsoDate("2026-03-06")!,
      weeklyTargetMinutes: 2520,
      standardWorkDays: 5,
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
      standardWorkDays: 5,
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { TZT: 1 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("TZT-Guthaben");
  });

  it("allows TZT requests in TARGET_REDUCTION model without checking TZT account", () => {
    const result = evaluateRequestEntitlement({
      type: "TZT",
      startDate: parseIsoDate("2026-03-02")!,
      endDate: parseIsoDate("2026-03-03")!,
      weeklyTargetMinutes: 2520,
      standardWorkDays: 5,
      tztModel: "TARGET_REDUCTION",
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { TZT: 0 },
      },
    });

    expect(result.ok).toBe(true);
  });

  it("rejects parental/care leave requests when dedicated balance is too low", () => {
    const result = evaluateRequestEntitlement({
      type: "PARENTAL_CARE",
      startDate: parseIsoDate("2026-03-02")!,
      endDate: parseIsoDate("2026-03-03")!,
      weeklyTargetMinutes: 2520,
      standardWorkDays: 5,
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { PARENTAL_CARE: 1 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Eltern-/Betreuungsurlaub");
  });

  it("rejects free-requested when zeitsaldo minutes are insufficient", () => {
    const result = evaluateRequestEntitlement({
      type: "FREE_REQUESTED",
      startDate: parseIsoDate("2026-03-02")!,
      endDate: parseIsoDate("2026-03-03")!,
      weeklyTargetMinutes: 2520,
      standardWorkDays: 5,
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
      standardWorkDays: 5,
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
      standardWorkDays: 5,
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { FERIEN: 1 },
        2027: { FERIEN: 1 },
      },
    });

    expect(result.ok).toBe(true);
  });

  it("Ferien gegen Feiertags-Montag: nur Arbeitstage zählen; 4 Tage reichen bei einem Feiertag in der gleichen KW", () => {
    const withHolidayExcluded = evaluateRequestEntitlement({
      type: "VACATION",
      startDate: parseIsoDate("2026-01-05")!,
      endDate: parseIsoDate("2026-01-09")!,
      weeklyTargetMinutes: 2520,
      standardWorkDays: 5,
      vacationDaysPerYear: 25,
      holidayIsosByYear: new Map([[2026, new Set(["2026-01-05"])]]),
      balancesByYear: {
        2026: { FERIEN: 4 },
      },
    });
    expect(withHolidayExcluded.ok).toBe(true);

    const withoutHolidayMap = evaluateRequestEntitlement({
      type: "VACATION",
      startDate: parseIsoDate("2026-01-05")!,
      endDate: parseIsoDate("2026-01-09")!,
      weeklyTargetMinutes: 2520,
      standardWorkDays: 5,
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { FERIEN: 4 },
      },
    });
    expect(withoutHolidayMap.ok).toBe(false);
  });

  it("VACATION ohne Soll-Tage im Zeitraum (nur Feiertage) ⇒ ok ohne Kontenbuch", () => {
    const ok = evaluateRequestEntitlement({
      type: "VACATION",
      startDate: parseIsoDate("2026-01-08")!,
      endDate: parseIsoDate("2026-01-08")!,
      weeklyTargetMinutes: 2520,
      standardWorkDays: 5,
      vacationDaysPerYear: 0,
      holidayIsosByYear: new Map([[2026, new Set(["2026-01-08"])]]),
      balancesByYear: {},
    });
    expect(ok.ok).toBe(true);
  });

  it("treats free-day like free-requested and enforces zeitsaldo", () => {
    const denied = evaluateRequestEntitlement({
      type: "FREE_DAY",
      startDate: parseIsoDate("2026-03-02")!,
      endDate: parseIsoDate("2026-03-02")!,
      weeklyTargetMinutes: 2520,
      standardWorkDays: 5,
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { ZEITSALDO: 100 },
      },
    });
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("Zeitsaldo");

    const allowed = evaluateRequestEntitlement({
      type: "FREE_DAY",
      startDate: parseIsoDate("2026-03-02")!,
      endDate: parseIsoDate("2026-03-02")!,
      weeklyTargetMinutes: 2520,
      standardWorkDays: 5,
      vacationDaysPerYear: 25,
      balancesByYear: {
        2026: { ZEITSALDO: 504 },
      },
    });
    expect(allowed.ok).toBe(true);
  });
});
