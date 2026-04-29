"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { createPrivacyRequest, decidePrivacyRequest } from "@/lib/privacy/core";
import {
  fieldErrorsFromZod,
  readOptionalString,
  requireAdmin,
  requireEmployee,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";

const createSchema = z.object({
  type: z.enum(["EXPORT", "ERASURE"]),
  note: z.string().max(1000).optional().nullable(),
});

const decideSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED", "COMPLETED"]),
  note: z.string().max(1000).optional().nullable(),
});

export async function createPrivacyRequestAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const employeeUser = await requireEmployee();
  const parsed = createSchema.safeParse({
    type: readOptionalString(formData.get("type")) ?? "",
    note: readOptionalString(formData.get("note")),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const created = await createPrivacyRequest(prisma, {
    tenantId: employeeUser.tenantId,
    employeeId: employeeUser.employeeId!,
    type: parsed.data.type,
    note: parsed.data.note ?? null,
  });

  await writeAudit({
    userId: employeeUser.id,
    action: "PRIVACY_REQUEST_CREATE",
    entity: "PrivacyRequest",
    entityId: created.id,
    newValue: {
      employeeId: employeeUser.employeeId,
      type: created.type,
      status: created.status,
    },
    comment: created.note,
  });

  safeRevalidatePath("createPrivacyRequestAction", "/my-requests");
  safeRevalidatePath("createPrivacyRequestAction", "/privacy");
  safeRevalidatePath("createPrivacyRequestAction", "/dashboard");
  return { ok: true };
}

export async function createPrivacyRequestFormAction(
  formData: FormData,
): Promise<void> {
  await createPrivacyRequestAction(undefined, formData);
}

export async function decidePrivacyRequestAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = decideSchema.safeParse({
    requestId: readOptionalString(formData.get("requestId")) ?? "",
    status: readOptionalString(formData.get("status")) ?? "",
    note: readOptionalString(formData.get("note")),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const decided = await decidePrivacyRequest(prisma, {
    tenantId: admin.tenantId,
    requestId: parsed.data.requestId,
    status: parsed.data.status,
    decidedById: admin.id,
    note: parsed.data.note ?? null,
  });
  if (!decided) return { ok: false, error: "Anfrage nicht gefunden." };

  await writeAudit({
    userId: admin.id,
    action: "PRIVACY_REQUEST_DECIDE",
    entity: "PrivacyRequest",
    entityId: decided.after.id,
    oldValue: { status: decided.before.status },
    newValue: { status: decided.after.status },
    comment: parsed.data.note ?? decided.after.note,
  });

  safeRevalidatePath("decidePrivacyRequestAction", "/privacy");
  safeRevalidatePath("decidePrivacyRequestAction", "/my-requests");
  safeRevalidatePath("decidePrivacyRequestAction", "/dashboard");
  return { ok: true };
}

export async function decidePrivacyRequestFormAction(
  formData: FormData,
): Promise<void> {
  await decidePrivacyRequestAction(undefined, formData);
}
