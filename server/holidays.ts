"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { holidaysForRegion } from "@/lib/holidays-ch";
import {
  requireAdmin,
  fieldErrorsFromZod,
  readOptionalString,
  type ActionResult,
} from "./_shared";

const addSchema = z.object({
  locationId: z.string().min(1, "Standort wählen"),
  date: z.coerce.date({ message: "Datum erforderlich" }),
  name: z.string().min(1, "Name erforderlich").max(80),
});

const generateSchema = z.object({
  locationId: z.string().min(1, "Standort wählen"),
  year: z.coerce
    .number()
    .int()
    .min(2000, "Jahr ≥ 2000")
    .max(2100, "Jahr ≤ 2100"),
});

export async function addHolidayAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = addSchema.safeParse({
    locationId: readOptionalString(formData.get("locationId")) ?? "",
    date: readOptionalString(formData.get("date")),
    name: readOptionalString(formData.get("name")) ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;
  const dateUtc = new Date(
    Date.UTC(
      data.date.getFullYear(),
      data.date.getMonth(),
      data.date.getDate(),
    ),
  );

  try {
    const created = await prisma.holiday.create({
      data: {
        locationId: data.locationId,
        date: dateUtc,
        name: data.name,
      },
    });

    await writeAudit({
      userId: admin.id,
      action: "CREATE",
      entity: "Holiday",
      entityId: created.id,
      newValue: {
        locationId: created.locationId,
        date: created.date.toISOString().slice(0, 10),
        name: created.name,
      },
    });
  } catch {
    return {
      ok: false,
      error: "Feiertag mit diesem Datum existiert bereits.",
      fieldErrors: { date: "Datum bereits belegt." },
    };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteHolidayAction(
  holidayId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const before = await prisma.holiday.findUnique({ where: { id: holidayId } });
  if (!before) {
    return { ok: false, error: "Feiertag nicht gefunden." };
  }

  await prisma.holiday.delete({ where: { id: holidayId } });

  await writeAudit({
    userId: admin.id,
    action: "DELETE",
    entity: "Holiday",
    entityId: holidayId,
    oldValue: {
      locationId: before.locationId,
      date: before.date.toISOString().slice(0, 10),
      name: before.name,
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function generateRegionHolidaysAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult<{ created: number; skipped: number }>> {
  const admin = await requireAdmin();

  const parsed = generateSchema.safeParse({
    locationId: readOptionalString(formData.get("locationId")) ?? "",
    year: formData.get("year"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const { locationId, year } = parsed.data;

  const location = await prisma.location.findUnique({
    where: { id: locationId },
  });
  if (!location) {
    return { ok: false, error: "Standort nicht gefunden." };
  }

  const defs = holidaysForRegion(location.holidayRegionCode, year);

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const existing = await prisma.holiday.findMany({
    where: { locationId, date: { gte: yearStart, lt: yearEnd } },
    select: { date: true },
  });
  const existingKeys = new Set(
    existing.map((h) => h.date.toISOString().slice(0, 10)),
  );

  let created = 0;
  let skipped = 0;
  for (const def of defs) {
    const key = def.date.toISOString().slice(0, 10);
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    await prisma.holiday.create({
      data: { locationId, date: def.date, name: def.name },
    });
    created += 1;
  }

  await writeAudit({
    userId: admin.id,
    action: "GENERATE",
    entity: "Holiday",
    entityId: locationId,
    newValue: {
      locationId,
      year,
      region: location.holidayRegionCode,
      created,
      skipped,
    },
  });

  revalidatePath("/settings");
  return { ok: true, data: { created, skipped } };
}
