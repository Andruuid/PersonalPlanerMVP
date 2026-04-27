import { addYears } from "date-fns";

export const ARCHIVE_RETENTION_YEARS = 10;

export function archiveUntil(baseDate: Date = new Date()): Date {
  return addYears(baseDate, ARCHIVE_RETENTION_YEARS);
}
