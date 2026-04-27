export type AccountType =
  | "ZEITSALDO"
  | "FERIEN"
  | "UEZ"
  | "TZT"
  | "SONNTAG_FEIERTAG_KOMPENSATION";
export type AccountUnit = "MINUTES" | "DAYS";

export interface AccountStateInput {
  accountType: AccountType;
  unit: AccountUnit;
  /** Final balance at the end of the closing year. */
  closingValue: number;
  /** The new annual allowance (e.g. vacationDaysPerYear), if applicable. */
  annualAllowance?: number;
}

export interface CarryoverPlan {
  accountType: AccountType;
  unit: AccountUnit;
  /** Opening balance for the new year's AccountBalance row. */
  newYearOpening: number;
  /** Signed value of the CARRYOVER booking to write in the new year. */
  carryoverBooking: number;
}

/**
 * Pure computation describing how to roll an account from year N to year N+1.
 *
 * Convention: the new year's AccountBalance.openingValue is set to the
 * regular annual allowance (0 for ZEITSALDO/UEZ/TZT, vacationDaysPerYear for
 * FERIEN). The previous year's closing balance is then written as a separate
 * CARRYOVER Booking, so the new year's currentValue = opening + carryover.
 */
export function planYearRollover(
  state: AccountStateInput,
): CarryoverPlan {
  const { accountType, unit, closingValue, annualAllowance } = state;

  if (accountType === "FERIEN") {
    return {
      accountType,
      unit,
      newYearOpening: annualAllowance ?? 0,
      carryoverBooking: closingValue,
    };
  }

  return {
    accountType,
    unit,
    newYearOpening: 0,
    carryoverBooking: closingValue,
  };
}
