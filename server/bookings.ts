"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { isoDateString, parseIsoDate } from "@/lib/time/week";
import {
  applyManualBooking,
  applyYearEndCarryover,
  deleteBooking,
  DeleteBookingError,
  ManualBookingError,
  recalcWeekClose as coreRecalcWeekClose,
  removeWeekClosingBookings as coreRemoveWeekClosingBookings,
} from "@/lib/bookings/core";
import {
  fieldErrorsFromZod,
  readOptionalString,
  requireAdmin,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";

/**
 * Idempotent recalc of AUTO_WEEKLY bookings for a closed week.
 *
 * Thin wrapper: delegates to `lib/bookings/core` for the DB work and adds
 * the audit log entry on top.
 */
export async function recalcWeekClose(
  weekId: string,
  closedByUserId: string,
): Promise<void> {
  const result = await coreRecalcWeekClose(prisma, weekId, closedByUserId);

  await writeAudit({
    userId: closedByUserId,
    action: "RECALC_WEEK",
    entity: "Week",
    entityId: weekId,
    newValue: {
      employeesAffected: result.employeesAffected,
      bookingsCreated: result.bookingsCreated,
    },
  });
}

export async function removeWeekClosingBookings(
  weekId: string,
  reopenedByUserId: string,
): Promise<void> {
  const result = await coreRemoveWeekClosingBookings(prisma, weekId);

  await writeAudit({
    userId: reopenedByUserId,
    action: "REVERT_RECALC_WEEK",
    entity: "Week",
    entityId: weekId,
    newValue: { bookingsRemoved: result.bookingsRemoved },
  });
}

const manualBookingSchema = z.object({
  employeeId: z.string().min(1, "Mitarbeitende:r erforderlich"),
  accountType: z.enum([
    "ZEITSALDO",
    "FERIEN",
    "UEZ",
    "TZT",
    "SONNTAG_FEIERTAG_KOMPENSATION",
    "PARENTAL_CARE",
  ]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum ungültig"),
  value: z.coerce.number().refine((v) => v !== 0, {
    message: "Wert darf nicht 0 sein",
  }),
  bookingType: z
    .enum(["MANUAL_CREDIT", "MANUAL_DEBIT", "CORRECTION"])
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

export async function deleteBookingAction(
  bookingId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  try {
    const result = await deleteBooking(prisma, bookingId);

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
