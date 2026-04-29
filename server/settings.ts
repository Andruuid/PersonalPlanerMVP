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
  defaultWeeklyTargetMinutes: z.coerce
    .number()
    .int("Ganzzahl erforderlich")
    .min(0, "Mindestens 0")
    .max(10080, "Maximal 10080"),
  defaultHazMinutesPerWeek: z.coerce
    .number()
    .int("Ganzzahl erforderlich")
    .min(0, "Mindestens 0")
    .max(10080, "Maximal 10080"),
  zeitsaldoMinLimitMinutes: z.preprocess((raw) => {
    if (raw === "" || raw === null || raw === undefined) return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : raw;
  }, z.union([z.null(), z.number().int().min(-500_000).max(500_000)])),
  uezPayoutPolicy: z.enum(["ALLOWED", "WITH_NOTICE", "BLOCKED"], {
    message: "UEZ-Richtlinie wählen",
  }),
});

type TenantBusinessRow = z.infer<typeof tenantBusinessSchema>;

function tenantBusinessUnchanged(
  before: TenantBusinessRow,
  next: TenantBusinessRow,
): boolean {
  return (
    before.defaultStandardWorkDays === next.defaultStandardWorkDays &&
    before.defaultWeeklyTargetMinutes === next.defaultWeeklyTargetMinutes &&
    before.defaultHazMinutesPerWeek === next.defaultHazMinutesPerWeek &&
    before.zeitsaldoMinLimitMinutes === next.zeitsaldoMinLimitMinutes &&
    before.uezPayoutPolicy === next.uezPayoutPolicy
  );
}

export async function updateTenantBusinessDefaultsAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = tenantBusinessSchema.safeParse({
    defaultStandardWorkDays: formData.get("defaultStandardWorkDays"),
    defaultWeeklyTargetMinutes: formData.get("defaultWeeklyTargetMinutes"),
    defaultHazMinutesPerWeek: formData.get("defaultHazMinutesPerWeek"),
    zeitsaldoMinLimitMinutes: formData.get("zeitsaldoMinLimitMinutes"),
    uezPayoutPolicy: formData.get("uezPayoutPolicy"),
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
    select: {
      defaultStandardWorkDays: true,
      defaultWeeklyTargetMinutes: true,
      defaultHazMinutesPerWeek: true,
      zeitsaldoMinLimitMinutes: true,
      uezPayoutPolicy: true,
    },
  });
  if (!before) {
    return { ok: false, error: "Mandant nicht gefunden." };
  }

  const next = parsed.data;
  if (tenantBusinessUnchanged(before, next)) {
    return { ok: true };
  }

  await prisma.tenant.update({
    where: { id: admin.tenantId },
    data: {
      defaultStandardWorkDays: next.defaultStandardWorkDays,
      defaultWeeklyTargetMinutes: next.defaultWeeklyTargetMinutes,
      defaultHazMinutesPerWeek: next.defaultHazMinutesPerWeek,
      zeitsaldoMinLimitMinutes: next.zeitsaldoMinLimitMinutes,
      uezPayoutPolicy: next.uezPayoutPolicy,
    },
  });

  await writeAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "Tenant",
    entityId: admin.tenantId,
    oldValue: {
      defaultStandardWorkDays: before.defaultStandardWorkDays,
      defaultWeeklyTargetMinutes: before.defaultWeeklyTargetMinutes,
      defaultHazMinutesPerWeek: before.defaultHazMinutesPerWeek,
      zeitsaldoMinLimitMinutes: before.zeitsaldoMinLimitMinutes,
      uezPayoutPolicy: before.uezPayoutPolicy,
    },
    newValue: {
      defaultStandardWorkDays: next.defaultStandardWorkDays,
      defaultWeeklyTargetMinutes: next.defaultWeeklyTargetMinutes,
      defaultHazMinutesPerWeek: next.defaultHazMinutesPerWeek,
      zeitsaldoMinLimitMinutes: next.zeitsaldoMinLimitMinutes,
      uezPayoutPolicy: next.uezPayoutPolicy,
    },
  });

  safeRevalidatePath("updateTenantBusinessDefaultsAction", "/settings");
  safeRevalidatePath("updateTenantBusinessDefaultsAction", "/", "layout");
  return { ok: true };
}
