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
import { DEFAULT_SERVICE_BLOCK_HEX } from "@/lib/planning/block-appearance";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BLOCK_HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function normalizeBlockColorHex(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  const withHash = t.startsWith("#") ? t : `#${t}`;
  return withHash.toUpperCase();
}

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
  defaultDays: z.coerce
    .number()
    .int("Ganzzahl")
    .min(0, "Mindestens 0")
    .max(127, "Maximal 127")
    .optional()
    .nullable(),
  requiredCount: z.coerce
    .number()
    .int("Ganzzahl")
    .min(0, "Mindestens 0")
    .max(50, "Maximal 50")
    .optional()
    .nullable(),
  blockColorHex: z.string().regex(BLOCK_HEX_RE, "Ungültige Block-Farbe"),
  isActive: z.boolean().default(true),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.extend({ id: z.string().min(1) });

function readDefaultDaysMask(formData: FormData): number | null {
  let mask = 0;
  for (let i = 0; i < 7; i += 1) {
    if (readBooleanFlag(formData.get(`defaultDay${i}`))) {
      mask |= 1 << i;
    }
  }
  return mask === 0 ? null : mask;
}

function readPositiveIntOrNull(value: FormDataEntryValue | null): number | null {
  const raw = readOptionalString(value);
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function rawFromForm(formData: FormData): Record<string, unknown> {
  return {
    id: readOptionalString(formData.get("id")) ?? undefined,
    name: readOptionalString(formData.get("name")) ?? "",
    code: (readOptionalString(formData.get("code")) ?? "").toUpperCase(),
    startTime: readOptionalString(formData.get("startTime")) ?? "",
    endTime: readOptionalString(formData.get("endTime")) ?? "",
    breakMinutes: formData.get("breakMinutes"),
    comment: readOptionalString(formData.get("comment")),
    defaultDays: readDefaultDaysMask(formData),
    requiredCount: readPositiveIntOrNull(formData.get("requiredCount")),
    blockColorHex: normalizeBlockColorHex(
      readOptionalString(formData.get("blockColorHex")) ??
        DEFAULT_SERVICE_BLOCK_HEX,
    ),
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
    where: { tenantId_code: { tenantId: admin.tenantId, code: data.code } },
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
      tenantId: admin.tenantId,
      code: data.code,
      startTime: data.startTime,
      endTime: data.endTime,
      breakMinutes: data.breakMinutes,
      comment: data.comment ?? null,
      defaultDays: data.defaultDays ?? null,
      requiredCount: data.requiredCount ?? null,
      isActive: data.isActive,
      blockColorHex: data.blockColorHex,
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
      defaultDays: service.defaultDays,
      requiredCount: service.requiredCount,
      isActive: service.isActive,
      blockColorHex: service.blockColorHex,
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
  if (before.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diese Dienstvorlage." };
  }

  if (before.code !== data.code) {
    const dup = await prisma.serviceTemplate.findUnique({
      where: { tenantId_code: { tenantId: admin.tenantId, code: data.code } },
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
      defaultDays: data.defaultDays ?? null,
      requiredCount: data.requiredCount ?? null,
      isActive: data.isActive,
      blockColorHex: data.blockColorHex,
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
      defaultDays: before.defaultDays,
      requiredCount: before.requiredCount,
      isActive: before.isActive,
      blockColorHex: before.blockColorHex,
    },
    newValue: {
      name: updated.name,
      code: updated.code,
      startTime: updated.startTime,
      endTime: updated.endTime,
      breakMinutes: updated.breakMinutes,
      comment: updated.comment,
      defaultDays: updated.defaultDays,
      requiredCount: updated.requiredCount,
      isActive: updated.isActive,
      blockColorHex: updated.blockColorHex,
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
  if (before.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diese Dienstvorlage." };
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
