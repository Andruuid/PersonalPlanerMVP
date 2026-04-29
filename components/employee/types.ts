import type { ShiftKey } from "@/lib/shift-style";

export type RequestType =
  | "VACATION"
  | "FREE_REQUESTED"
  | "UEZ_BEZUG"
  | "TZT"
  | "FREE_DAY"
  | "PARENTAL_CARE";
export type RequestStatus = "OPEN" | "APPROVED" | "REJECTED";

export interface MyDayView {
  iso: string;
  longDate: string;
  shortDate: string;
  weekdayLabel: string;
  isWeekend: boolean;
  holidayName: string | null;
  shiftKey: ShiftKey;
  title: string;
  timeRange: string | null;
  subtitle: string | null;
}

export interface MyWeekHeader {
  year: number;
  weekNumber: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  publishedAt: string | null;
  hasSnapshot: boolean;
}

export interface MyAccountValue {
  unit: "MINUTES" | "DAYS";
  value: number;
}

export interface MyAccountsView {
  zeitsaldo: MyAccountValue | null;
  ferien: MyAccountValue | null;
  tzt: MyAccountValue | null;
  uez: MyAccountValue | null;
  sonntagFeiertagKompensation: MyAccountValue | null;
  parentalCare: MyAccountValue | null;
}

export interface MyRequestView {
  id: string;
  type: RequestType;
  status: RequestStatus;
  startIso: string;
  endIso: string;
  rangeLabel: string;
  comment: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  VACATION: "Ferienantrag",
  FREE_REQUESTED: "Frei verlangt",
  UEZ_BEZUG: "UEZ-Bezug",
  TZT: "TZT-Antrag",
  FREE_DAY: "Freier Tag",
  PARENTAL_CARE: "Eltern-/Betreuungsurlaub",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  OPEN: "Offen",
  APPROVED: "Genehmigt",
  REJECTED: "Abgelehnt",
};

export const REQUEST_STATUS_BADGE: Record<RequestStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
};
