import type { ShiftKey } from "@/lib/shift-style";

export type RequestType =
  | "VACATION"
  | "FREE_REQUESTED"
  | "UEZ_BEZUG"
  | "TZT"
  | "FREE_DAY"
  | "PARENTAL_CARE";
export type RequestStatus =
  | "OPEN"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN"
  | "CANCELLED";

/** Dienstvorlagen für Schicht-Wunsch (Mitarbeiter-UI). */
export interface ServiceTemplateWishOption {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface MyShiftWishView {
  id: string;
  status: RequestStatus;
  dateIso: string;
  dateLabel: string;
  summaryLabel: string;
  comment: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface MyDayView {
  iso: string;
  longDate: string;
  shortDate: string;
  weekdayLabel: string;
  isWeekend: boolean;
  holidayName: string | null;
  shiftKey: ShiftKey;
  /** Aus Publish-Snapshot; bei SHIFT gesetzt */
  serviceBlockColorHex: string | null;
  title: string;
  timeRange: string | null;
  subtitle: string | null;
  /** null ohne veröffentlichten Snapshot oder Pensum-Daten */
  displayContributionMinutes: number | null;
  /** Nur «Freier Tag (Zeitsaldo)» / FREE_REQUESTED: Hinweis auf Zeitsaldo-Buchung am KW-Sonntag */
  freeRequestedZeitsaldoTooltip: string | null;
}

export interface MyWeekHeader {
  year: number;
  weekNumber: number;
  status: "DRAFT" | "REOPENED" | "PUBLISHED" | "CLOSED";
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
  FREE_REQUESTED: "Freier Tag (Zeitsaldo)",
  UEZ_BEZUG: "UEZ-Bezug",
  TZT: "TZT-Antrag",
  FREE_DAY: "Freier Tag (Zeitsaldo)",
  PARENTAL_CARE: "Eltern-/Betreuungsurlaub",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  OPEN: "Offen",
  APPROVED: "Genehmigt",
  REJECTED: "Abgelehnt",
  WITHDRAWN: "Zurückgezogen",
  CANCELLED: "Storniert",
};

export const REQUEST_STATUS_BADGE: Record<RequestStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  WITHDRAWN: "bg-neutral-200 text-neutral-700",
  CANCELLED: "bg-neutral-200 text-neutral-700",
};
