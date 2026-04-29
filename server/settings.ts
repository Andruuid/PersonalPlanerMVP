"use server";

import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  fieldErrorsFromZod,
  requireAdmin,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";

const tenantBusinessSchema = z.object({
  defaultStandardWorkDays: z.coerce
    .number()
    .int("Ganzzahl erforderlich")
    .min(1, "Mindestens 1")
    .max(7, "Maximal 7"),
});

export async function updateTenantBusinessDefaultsAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = tenantBusinessSchema.safeParse({
    defaultStandardWorkDays: formData.get("defaultStandardWorkDays"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const before = await prisma.tenant.findUnique({
    where: { id: admin.tenantId },
    select: { defaultStandardWorkDays: true },
  });
  if (!before) {
    return { ok: false, error: "Mandant nicht gefunden." };
  }

  const next = parsed.data.defaultStandardWorkDays;
  if (before.defaultStandardWorkDays === next) {
    return { ok: true };
  }

  await prisma.tenant.update({
    where: { id: admin.tenantId },
    data: { defaultStandardWorkDays: next },
  });

  await writeAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "Tenant",
    entityId: admin.tenantId,
    oldValue: { defaultStandardWorkDays: before.defaultStandardWorkDays },
    newValue: { defaultStandardWorkDays: next },
  });

  safeRevalidatePath("updateTenantBusinessDefaultsAction", "/settings");
  safeRevalidatePath("updateTenantBusinessDefaultsAction", "/", "layout");
  return { ok: true };
}
