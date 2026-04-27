"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  requireAdmin,
  fieldErrorsFromZod,
  readOptionalString,
  readBooleanFlag,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const baseSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(80),
  code: z
    .string()
    .min(1, "Kürzel erforderlich")
    .max(30, "Maximal 30 Zeichen")
    .regex(/^[A-Z0-9_-]+$/, "Nur A–Z, 0–9, _ und -"),
  startTime: z.string().regex(TIME_RE, "Format HH:MM"),
  endTime: z.string().regex(TIME_RE, "Format HH:MM"),
  breakMinutes: z.coerce
    .number()
    .int("Ganzzahl")
    .min(0, "Mindestens 0")
    .max(240, "Maximal 240"),
  comment: z.string().max(120).optional().nullable(),
  isActive: z.boolean().default(true),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.extend({ id: z.string().min(1) });

function rawFromForm(formData: FormData): Record<string, unknown> {
  return {
    id: readOptionalString(formData.get("id")) ?? undefined,
    name: readOptionalString(formData.get("name")) ?? "",
    code: (readOptionalString(formData.get("code")) ?? "").toUpperCase(),
    startTime: readOptionalString(formData.get("startTime")) ?? "",
    endTime: readOptionalString(formData.get("endTime")) ?? "",
    breakMinutes: formData.get("breakMinutes"),
    comment: readOptionalString(formData.get("comment")),
    isActive: readBooleanFlag(formData.get("isActive")),
  };
}

export async function createServiceAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = createSchema.safeParse(rawFromForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;

  const dup = await prisma.serviceTemplate.findUnique({
    where: { code: data.code },
  });
  if (dup) {
    return {
      ok: false,
      error: "Kürzel bereits vergeben.",
      fieldErrors: { code: "Kürzel bereits vergeben." },
    };
  }

  const service = await prisma.serviceTemplate.create({
    data: {
      name: data.name,
      code: data.code,
      startTime: data.startTime,
      endTime: data.endTime,
      breakMinutes: data.breakMinutes,
      comment: data.comment ?? null,
      isActive: data.isActive,
    },
  });

  await writeAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "ServiceTemplate",
    entityId: service.id,
    newValue: {
      name: service.name,
      code: service.code,
      startTime: service.startTime,
      endTime: service.endTime,
      breakMinutes: service.breakMinutes,
      comment: service.comment,
      isActive: service.isActive,
    },
  });

  safeRevalidatePath("createServiceAction", "/services");
  safeRevalidatePath("createServiceAction", "/", "layout");
  return { ok: true };
}

export async function updateServiceAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = updateSchema.safeParse(rawFromForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;

  const before = await prisma.serviceTemplate.findUnique({
    where: { id: data.id },
  });
  if (!before) {
    return { ok: false, error: "Dienstvorlage nicht gefunden." };
  }

  if (before.code !== data.code) {
    const dup = await prisma.serviceTemplate.findUnique({
      where: { code: data.code },
    });
    if (dup && dup.id !== data.id) {
      return {
        ok: false,
        error: "Kürzel bereits vergeben.",
        fieldErrors: { code: "Kürzel bereits vergeben." },
      };
    }
  }

  const updated = await prisma.serviceTemplate.update({
    where: { id: data.id },
    data: {
      name: data.name,
      code: data.code,
      startTime: data.startTime,
      endTime: data.endTime,
      breakMinutes: data.breakMinutes,
      comment: data.comment ?? null,
      isActive: data.isActive,
    },
  });

  await writeAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "ServiceTemplate",
    entityId: updated.id,
    oldValue: {
      name: before.name,
      code: before.code,
      startTime: before.startTime,
      endTime: before.endTime,
      breakMinutes: before.breakMinutes,
      comment: before.comment,
      isActive: before.isActive,
    },
    newValue: {
      name: updated.name,
      code: updated.code,
      startTime: updated.startTime,
      endTime: updated.endTime,
      breakMinutes: updated.breakMinutes,
      comment: updated.comment,
      isActive: updated.isActive,
    },
  });

  safeRevalidatePath("updateServiceAction", "/services");
  safeRevalidatePath("updateServiceAction", "/", "layout");
  return { ok: true };
}

export async function setServiceActiveAction(
  serviceId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const before = await prisma.serviceTemplate.findUnique({
    where: { id: serviceId },
  });
  if (!before) {
    return { ok: false, error: "Dienstvorlage nicht gefunden." };
  }

  const updated = await prisma.serviceTemplate.update({
    where: { id: serviceId },
    data: { isActive },
  });

  await writeAudit({
    userId: admin.id,
    action: isActive ? "ACTIVATE" : "DEACTIVATE",
    entity: "ServiceTemplate",
    entityId: updated.id,
    oldValue: { isActive: before.isActive },
    newValue: { isActive },
  });

  safeRevalidatePath("setServiceActiveAction", "/services");
  safeRevalidatePath("setServiceActiveAction", "/", "layout");
  return { ok: true };
}
