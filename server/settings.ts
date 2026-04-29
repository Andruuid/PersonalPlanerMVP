"use server";

import { z } from "zod";
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
  await prisma.tenant.update({
    where: { id: admin.tenantId },
    data: { defaultStandardWorkDays: parsed.data.defaultStandardWorkDays },
  });
  safeRevalidatePath("updateTenantBusinessDefaultsAction", "/settings");
  safeRevalidatePath("updateTenantBusinessDefaultsAction", "/", "layout");
  return { ok: true };
}
