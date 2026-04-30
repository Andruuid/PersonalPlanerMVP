import type { BookingType } from "@/lib/generated/prisma/enums";

/** Short labels for booking-type badges / tooltips (German UI). */
export const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  OPENING: "Eröffnung",
  AUTO_WEEKLY: "Wochenabschluss",
  FREE_REQUESTED: "Freier Tag (Zeitsaldo)",
  MANUAL_CREDIT: "Gutschrift",
  MANUAL_DEBIT: "Belastung",
  CORRECTION: "Korrektur",
  CARRYOVER: "Vortrag",
  COMPENSATION_REDEMPTION: "Kompensationsbezug",
  COMPENSATION_EXPIRED: "Abgelaufen (Verfall)",
  UEZ_PAYOUT: "UEZ-Auszahlung",
  UEZ_REDEMPTION: "UEZ-Bezug",
};

export const BOOKING_TYPE_BADGE: Record<BookingType, string> = {
  OPENING: "bg-neutral-100 text-neutral-700",
  AUTO_WEEKLY: "bg-neutral-100 text-neutral-700",
  FREE_REQUESTED: "bg-violet-100 text-violet-800",
  MANUAL_CREDIT: "bg-emerald-100 text-emerald-800",
  MANUAL_DEBIT: "bg-rose-100 text-rose-800",
  CORRECTION: "bg-amber-100 text-amber-800",
  CARRYOVER: "bg-sky-100 text-sky-800",
  COMPENSATION_REDEMPTION: "bg-rose-100 text-rose-800",
  COMPENSATION_EXPIRED: "bg-red-100 text-red-900 ring-1 ring-red-300",
  UEZ_PAYOUT: "bg-amber-100 text-amber-900",
  UEZ_REDEMPTION: "bg-orange-100 text-orange-950",
};
