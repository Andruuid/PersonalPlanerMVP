"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { isoDateString, parseIsoDate } from "@/lib/time/week";
import {
  applyManualBooking,
  applyUezPayout,
  applyYearEndCarryover,
  deleteBooking,
  DeleteBookingError,
  ManualBookingError,
  normalizeUezPayoutPolicy,
  UezPayoutError,
} from "@/lib/bookings/core";
import {
  fieldErrorsFromZod,
  readOptionalString,
  requireAdmin,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";

// Real, persistable accounts per Spec — these can carry an opening balance
// and accept manual bookings. SONNTAG_FEIERTAG_KOMPENSATION is a fristgebundener
// offener Fall (Spec): Bewegungen entstehen ausschliesslich aus AUTO_WEEKLY
// (Wochenabschluss) oder dem expliziten Bezug-Workflow
// (`server/compensations.ts` → BookingType.COMPENSATION_REDEMPTION). Direkte
// MANUAL_CREDIT/MANUAL_DEBIT/CORRECTION/OPENING-Buchungen sind dort
// semantisch falsch und werden hier zurückgewiesen.
const MANUAL_BOOKING_ACCOUNT_TYPES = [
  "ZEITSALDO",
  "FERIEN",
  "UEZ",
  "TZT",
  "PARENTAL_CARE",
] as const;

const manualBookingSchema = z.object({
  employeeId: z.string().min(1, "Mitarbeitende:r erforderlich"),
  accountType: z.enum(MANUAL_BOOKING_ACCOUNT_TYPES, {
    message:
      "Manuelle Buchung für dieses Konto nicht zulässig. Sonn-/Feiertagskompensation wird automatisch aus dem Wochenabschluss gebildet und über den Bezug-Workflow eingelöst.",
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum ungültig"),
  value: z.coerce.number().refine((v) => v !== 0, {
    message: "Wert darf nicht 0 sein",
  }),
  bookingType: z
    .enum(["MANUAL_CREDIT", "MANUAL_DEBIT", "CORRECTION", "OPENING"])
    .default("MANUAL_CREDIT"),
  comment: z
    .string()
    .min(3, "Bitte einen Grund angeben")
    .max(300, "Maximal 300 Zeichen"),
});

export async function manualBookingAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const raw = {
    employeeId: readOptionalString(formData.get("employeeId")) ?? "",
    accountType: readOptionalString(formData.get("accountType")) ?? "",
    date: readOptionalString(formData.get("date")) ?? "",
    value: formData.get("value"),
    bookingType: readOptionalString(formData.get("bookingType")) ?? undefined,
    comment: readOptionalString(formData.get("comment")) ?? "",
  };

  const parsed = manualBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;

  const date = parseIsoDate(data.date);
  if (!date) return { ok: false, error: "Datum ungültig." };

  try {
    const result = await applyManualBooking(prisma, {
      employeeId: data.employeeId,
      tenantId: admin.tenantId,
      accountType: data.accountType,
      date,
      value: data.value,
      bookingType: data.bookingType,
      comment: data.comment,
      createdByUserId: admin.id,
    });

    await writeAudit({
      userId: admin.id,
      action: "MANUAL_BOOKING",
      entity: "Booking",
      entityId: result.bookingId,
      newValue: {
        employeeId: data.employeeId,
        accountType: data.accountType,
        bookingType: data.bookingType,
        value: result.signedValue,
        date: data.date,
        ...(data.bookingType === "OPENING" ? { isOpening: true } : {}),
      },
      comment: data.comment,
    });

    safeRevalidatePath("manualBookingAction", "/accounts");
    safeRevalidatePath("manualBookingAction", "/my-accounts");
    return { ok: true };
  } catch (err) {
    if (err instanceof ManualBookingError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

const uezPayoutSchema = z.object({
  employeeId: z.string().min(1, "Mitarbeitende:r erforderlich"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum ungültig"),
  minutes: z.coerce
    .number()
    .int("Ganzzahl in Minuten erforderlich")
    .positive("Minuten müssen grösser als 0 sein"),
  comment: z
    .string()
    .min(3, "Bitte einen Grund angeben")
    .max(300, "Maximal 300 Zeichen"),
  acknowledgedNoticeText: z
    .string()
    .max(300, "Maximal 300 Zeichen")
    .optional()
    .default(""),
});

/**
 * Auszahlung von UEZ-Minuten: eine negative Buchung mit BookingType.UEZ_PAYOUT.
 */
export async function payoutUezAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const tenantRow = await prisma.tenant.findUnique({
    where: { id: admin.tenantId },
    select: { uezPayoutPolicy: true },
  });
  const policy = normalizeUezPayoutPolicy(tenantRow?.uezPayoutPolicy);

  const raw = {
    employeeId: readOptionalString(formData.get("employeeId")) ?? "",
    date: readOptionalString(formData.get("date")) ?? "",
    minutes: formData.get("minutes"),
    comment: readOptionalString(formData.get("comment")) ?? "",
    acknowledgedNoticeText:
      readOptionalString(formData.get("acknowledgedNoticeText")) ?? "",
  };

  const parsed = uezPayoutSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;

  const date = parseIsoDate(data.date);
  if (!date) return { ok: false, error: "Datum ungültig." };

  try {
    const result = await applyUezPayout(prisma, {
      employeeId: data.employeeId,
      tenantId: admin.tenantId,
      date,
      minutes: data.minutes,
      comment: data.comment,
      createdByUserId: admin.id,
      policy,
      acknowledgedNoticeText: data.acknowledgedNoticeText,
    });

    const noticeSnap =
      policy === "WITH_NOTICE" && data.acknowledgedNoticeText.trim().length > 0
        ? data.acknowledgedNoticeText.trim()
        : undefined;

    await writeAudit({
      userId: admin.id,
      action: "UEZ_PAYOUT",
      entity: "Booking",
      entityId: result.bookingId,
      newValue: {
        employeeId: data.employeeId,
        accountType: "UEZ",
        bookingType: "UEZ_PAYOUT",
        value: result.signedValue,
        date: data.date,
        policy,
        ...(noticeSnap ? { noticeText: noticeSnap } : {}),
      },
      comment: data.comment,
    });

    safeRevalidatePath("payoutUezAction", "/accounts");
    safeRevalidatePath("payoutUezAction", "/my-accounts");
    return { ok: true };
  } catch (err) {
    if (err instanceof UezPayoutError) {
      if (err.code === "POLICY_NOTICE_INCOMPLETE") {
        return {
          ok: false,
          error: err.message,
          fieldErrors: {
            comment:
              "Mindestens 20 Zeichen, oder Feld «Hinweis an Mitarbeitende» ausfüllen.",
            acknowledgedNoticeText:
              "Oder hier einen Hinweis eintragen (z. B. «informiert am …»).",
          },
        };
      }
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

export async function deleteBookingAction(
  bookingId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  try {
    const result = await deleteBooking(prisma, bookingId, admin.tenantId);

    await writeAudit({
      userId: admin.id,
      action: "DELETE",
      entity: "Booking",
      entityId: bookingId,
      oldValue: {
        employeeId: result.employeeId,
        accountType: result.accountType,
        bookingType: result.bookingType,
        value: result.value,
        date: isoDateString(result.date),
      },
    });

    safeRevalidatePath("deleteBookingAction", "/accounts");
    safeRevalidatePath("deleteBookingAction", "/my-accounts");
    return { ok: true };
  } catch (err) {
    if (err instanceof DeleteBookingError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

const yearEndSchema = z.object({
  fromYear: z.coerce.number().int().min(2000).max(2100),
});

export async function runYearEndCarryoverAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = yearEndSchema.safeParse({
    fromYear: formData.get("fromYear"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Jahr prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const result = await applyYearEndCarryover(
    prisma,
    parsed.data.fromYear,
    admin.id,
    admin.tenantId,
  );

  await writeAudit({
    userId: admin.id,
    action: "YEAR_END_CARRYOVER",
    entity: "AccountBalance",
    newValue: {
      fromYear: result.fromYear,
      toYear: result.toYear,
      employees: result.employeesProcessed,
      bookingsCreated: result.bookingsCreated,
    },
  });

  safeRevalidatePath("runYearEndCarryoverAction", "/accounts");
  safeRevalidatePath("runYearEndCarryoverAction", "/my-accounts");
  return { ok: true };
}
