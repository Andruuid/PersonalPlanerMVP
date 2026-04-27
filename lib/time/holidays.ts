import { format } from "date-fns";

export interface HolidayLookup {
  has: (isoDate: string) => boolean;
  nameOf: (isoDate: string) => string | null;
}

export interface HolidayInput {
  date: Date;
  name: string;
}

/**
 * Build a fast O(1) lookup over a list of holiday dates. Dates are normalized
 * to ISO yyyy-MM-dd strings using the local date components (so a Date with
 * UTC midnight on 2026-01-01 is treated as the holiday `2026-01-01`).
 */
export function buildHolidayLookup(holidays: HolidayInput[]): HolidayLookup {
  const map = new Map<string, string>();
  for (const h of holidays) {
    map.set(format(h.date, "yyyy-MM-dd"), h.name);
  }
  return {
    has: (iso) => map.has(iso),
    nameOf: (iso) => map.get(iso) ?? null,
  };
}
