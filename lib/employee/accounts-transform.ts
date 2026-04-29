import type {
  MyAccountValue,
  MyAccountsView,
} from "@/components/employee/types";

export type AccountBalanceRow = {
  accountType: string;
  unit: string;
  currentValue: number;
};

export type EmployeeStammdatenForAccounts = {
  vacationDaysPerYear: number;
} | null;

const ACCOUNT_TYPES = [
  "ZEITSALDO",
  "FERIEN",
  "UEZ",
  "TZT",
  "SONNTAG_FEIERTAG_KOMPENSATION",
  "PARENTAL_CARE",
] as const;

type AccountTypeKey = (typeof ACCOUNT_TYPES)[number];

function pick(
  balances: AccountBalanceRow[],
  accountType: AccountTypeKey,
): MyAccountValue | null {
  const row = balances.find((b) => b.accountType === accountType);
  if (!row) return null;
  return {
    unit: row.unit as MyAccountValue["unit"],
    value: row.currentValue,
  };
}

/**
 * Pure transform: maps the `AccountBalance` rows for a single
 * (employee, year) onto the `MyAccountsView` the employee UI consumes.
 *
 * `FERIEN` falls back to the annual allowance from Stammdaten until the
 * first week-close (or manual booking) of that year creates the row —
 * mirrors `ensureBalanceRow` in `lib/bookings/core`.
 */
export function buildMyAccountsView(
  balances: AccountBalanceRow[],
  employee: EmployeeStammdatenForAccounts,
): MyAccountsView {
  const ferienFromDb = pick(balances, "FERIEN");
  const ferien: MyAccountValue | null =
    ferienFromDb ??
    (employee
      ? { unit: "DAYS", value: employee.vacationDaysPerYear }
      : null);

  return {
    zeitsaldo: pick(balances, "ZEITSALDO"),
    ferien,
    tzt: pick(balances, "TZT"),
    uez: pick(balances, "UEZ"),
    sonntagFeiertagKompensation: pick(balances, "SONNTAG_FEIERTAG_KOMPENSATION"),
    parentalCare: pick(balances, "PARENTAL_CARE"),
  };
}
