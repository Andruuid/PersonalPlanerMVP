import type { ShiftKey } from "@/lib/shift-style";

export type EntryKind = "SHIFT" | "ONE_TIME_SHIFT" | "ABSENCE";

export type AbsenceType =
  | "VACATION"
  | "SICK"
  | "ACCIDENT"
  | "FREE_REQUESTED"
  | "UNPAID"
  | "TZT"
  | "PARENTAL_CARE"
  | "MILITARY_SERVICE"
  | "CIVIL_PROTECTION_SERVICE"
  | "CIVIL_SERVICE"
  | "HOLIDAY_AUTO";

export interface PlanEntryView {
  id: string;
  kind: EntryKind;
  serviceTemplateId: string | null;
  serviceCode: string | null;
  serviceName: string | null;
  serviceTime: string | null;
  serviceComment: string | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  oneTimeBreakMinutes: number | null;
  oneTimeLabel: string | null;
  absenceType: AbsenceType | null;
  shiftKey: ShiftKey;
  title: string;
  subtitle: string | null;
}

export interface EmployeeView {
  id: string;
  firstName: string;
  lastName: string;
  roleLabel: string | null;
}

export interface DayView {
  iso: string;
  weekdayLabel: string;
  shortDate: string;
  longDate: string;
}

export interface ServiceOption {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  comment: string | null;
}

export interface RequestView {
  id: string;
  type: "VACATION" | "FREE_REQUESTED" | "TZT" | "FREE_DAY" | "PARENTAL_CARE";
  status: "OPEN" | "APPROVED" | "REJECTED";
  startDate: string;
  endDate: string;
  rangeLabel: string;
  employeeName: string;
  employeeId: string;
  comment: string | null;
}

export interface WeekView {
  id: string;
  year: number;
  weekNumber: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  publishedAt: string | null;
  closedAt: string | null;
}

export interface KpiSummary {
  openRequests: number;
  unassignedCells: number;
  activeEmployees: number;
  statusLabel: string;
}

export type EntryMap = Record<string, PlanEntryView>;

export function entryKey(employeeId: string, isoDate: string): string {
  return `${employeeId}__${isoDate}`;
}
