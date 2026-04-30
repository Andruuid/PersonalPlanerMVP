import { describe, expect, it } from "vitest";
import {
  buildMyAccountsView,
  type AccountBalanceRow,
} from "@/lib/employee/accounts-transform";

const employee = { vacationDaysPerYear: 25, baseDailySollMinutes: 504 };

describe("buildMyAccountsView", () => {
  it("populates UEZ and Sonn-/Feiertagskompensation when their AccountBalance rows exist", () => {
    const balances: AccountBalanceRow[] = [
      { accountType: "UEZ", unit: "MINUTES", currentValue: 240 },
      {
        accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
        unit: "MINUTES",
        currentValue: -90,
      },
    ];

    const view = buildMyAccountsView(balances, employee);

    expect(view.uez).toEqual({ unit: "MINUTES", value: 240 });
    expect(view.sonntagFeiertagKompensation).toEqual({
      unit: "MINUTES",
      value: -90,
    });
  });

  it("leaves UEZ and Sonn-/Feiertagskompensation null when no rows exist", () => {
    const view = buildMyAccountsView([], employee);

    expect(view.uez).toBeNull();
    expect(view.sonntagFeiertagKompensation).toBeNull();
  });

  it("falls back to Stammdaten allowance for FERIEN until the row is materialised", () => {
    const view = buildMyAccountsView([], employee);
    expect(view.ferien).toEqual({
      unit: "MINUTES",
      value: 12600,
      baseDailySollMinutes: 504,
    });
  });
});
