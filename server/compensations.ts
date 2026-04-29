"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { parseIsoDate } from "@/lib/time/week";
import {
  applyCompensationRedemption,
  CompensationRedemptionError,
} from "@/lib/bookings/core";
import {
  fieldErrorsFromZod,
  readOptionalString,
  requireAdmin,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";

const redeemSchema = z.object({
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
});

/**
 * Bezug ("Redemption") von SONNTAG_FEIERTAG_KOMPENSATION-Stunden:
 * postet eine einzige negative Buchung vom Typ COMPENSATION_REDEMPTION
 * gegen das Kompensationskonto und schreibt einen Audit-Eintrag.
 *
 * Bewegungen auf SONNTAG_FEIERTAG_KOMPENSATION sind ausschliesslich über
 * diesen Workflow oder den Wochenabschluss (AUTO_WEEKLY) möglich; manuelle
 * Buchungen (`manualBookingAction`) werden für dieses Konto abgewiesen.
 */
export async function redeemCompensationAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const raw = {
    employeeId: readOptionalString(formData.get("employeeId")) ?? "",
    date: readOptionalString(formData.get("date")) ?? "",
    minutes: formData.get("minutes"),
    comment: readOptionalString(formData.get("comment")) ?? "",
  };

  const parsed = redeemSchema.safeParse(raw);
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
    const result = await applyCompensationRedemption(prisma, {
      employeeId: data.employeeId,
      tenantId: admin.tenantId,
      date,
      minutes: data.minutes,
      comment: data.comment,
      createdByUserId: admin.id,
    });

    await writeAudit({
      userId: admin.id,
      action: "COMPENSATION_REDEMPTION",
      entity: "Booking",
      entityId: result.bookingId,
      newValue: {
        employeeId: data.employeeId,
        accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
        bookingType: "COMPENSATION_REDEMPTION",
        value: result.signedValue,
        date: data.date,
      },
      comment: data.comment,
    });

    safeRevalidatePath("redeemCompensationAction", "/accounts");
    safeRevalidatePath("redeemCompensationAction", "/my-accounts");
    return { ok: true };
  } catch (err) {
    if (err instanceof CompensationRedemptionError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}
