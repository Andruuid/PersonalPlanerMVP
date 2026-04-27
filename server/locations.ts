"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  requireAdmin,
  fieldErrorsFromZod,
  readOptionalString,
  type ActionResult,
} from "./_shared";

const baseSchema = z.object({
  name: z.string().min(1, "Name erforderlich").max(80),
  holidayRegionCode: z
    .string()
    .min(1, "Region erforderlich")
    .max(4)
    .regex(/^[A-Z]+$/, "Nur Grossbuchstaben"),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.extend({ id: z.string().min(1) });

function rawFromForm(formData: FormData): Record<string, unknown> {
  return {
    id: readOptionalString(formData.get("id")) ?? undefined,
    name: readOptionalString(formData.get("name")) ?? "",
    holidayRegionCode: (
      readOptionalString(formData.get("holidayRegionCode")) ?? ""
    ).toUpperCase(),
  };
}

export async function createLocationAction(
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

  const created = await prisma.location.create({
    data: {
      name: data.name,
      holidayRegionCode: data.holidayRegionCode,
    },
  });

  await writeAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "Location",
    entityId: created.id,
    newValue: {
      name: created.name,
      holidayRegionCode: created.holidayRegionCode,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateLocationAction(
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

  const before = await prisma.location.findUnique({ where: { id: data.id } });
  if (!before) {
    return { ok: false, error: "Standort nicht gefunden." };
  }

  const updated = await prisma.location.update({
    where: { id: data.id },
    data: {
      name: data.name,
      holidayRegionCode: data.holidayRegionCode,
    },
  });

  await writeAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "Location",
    entityId: updated.id,
    oldValue: {
      name: before.name,
      holidayRegionCode: before.holidayRegionCode,
    },
    newValue: {
      name: updated.name,
      holidayRegionCode: updated.holidayRegionCode,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true };
}
