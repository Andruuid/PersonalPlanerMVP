"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  holidaysForCatholic,
  holidaysForReformed,
  type HolidayConfession,
  holidaysForRegion,
} from "@/lib/holidays-ch";
import { isoDateString } from "@/lib/time/week";
import {
  requireAdmin,
  fieldErrorsFromZod,
  readOptionalString,
  safeRevalidatePath,
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

const proposeSchema = z.object({
  locationId: z.string().min(1, "Standort wählen"),
  year: z.number().int().min(2000, "Jahr ≥ 2000").max(2100, "Jahr ≤ 2100"),
  confession: z.enum(["EVANGELISCH", "KATHOLISCH"]),
});

const holidayDraftSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum muss im Format YYYY-MM-DD sein."),
  name: z.string().trim().min(1, "Name erforderlich").max(80),
});

const acceptSchema = z.object({
  locationId: z.string().min(1, "Standort wählen"),
  year: z.number().int().min(2000, "Jahr ≥ 2000").max(2100, "Jahr ≤ 2100"),
  holidays: z.array(holidayDraftSchema),
});

export interface HolidayDraft {
  date: string;
  name: string;
}

function yearBoundsUtc(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

function parseIsoDateToUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

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

  const location = await prisma.location.findUnique({
    where: { id: data.locationId },
    select: { tenantId: true, deletedAt: true },
  });
  if (!location || location.tenantId !== admin.tenantId || location.deletedAt) {
    return {
      ok: false,
      error: "Standort nicht gefunden.",
      fieldErrors: { locationId: "Standort nicht gefunden." },
    };
  }

  try {
    const created = await prisma.holiday.create({
      data: {
        tenantId: admin.tenantId,
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
        date: isoDateString(created.date),
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

  safeRevalidatePath("addHolidayAction", "/settings");
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
  if (before.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diesen Feiertag." };
  }

  await prisma.holiday.delete({ where: { id: holidayId } });

  await writeAudit({
    userId: admin.id,
    action: "DELETE",
    entity: "Holiday",
    entityId: holidayId,
    oldValue: {
      locationId: before.locationId,
      date: isoDateString(before.date),
      name: before.name,
    },
  });

  safeRevalidatePath("deleteHolidayAction", "/settings");
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
  if (!location || location.deletedAt) {
    return { ok: false, error: "Standort nicht gefunden." };
  }
  if (location.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diesen Standort." };
  }

  const defs = holidaysForRegion(location.holidayRegionCode, year);

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const existing = await prisma.holiday.findMany({
    where: { tenantId: admin.tenantId, locationId, date: { gte: yearStart, lt: yearEnd } },
    select: { date: true },
  });
  const existingKeys = new Set(
    existing.map((h) => isoDateString(h.date)),
  );

  let created = 0;
  let skipped = 0;
  for (const def of defs) {
    const key = isoDateString(def.date);
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    await prisma.holiday.create({
      data: { tenantId: admin.tenantId, locationId, date: def.date, name: def.name },
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

  safeRevalidatePath("generateRegionHolidaysAction", "/settings");
  return { ok: true, data: { created, skipped } };
}

export async function proposeHolidaysForLocationAction(
  locationId: string,
  year: number,
  confession: HolidayConfession,
): Promise<ActionResult<{ holidays: HolidayDraft[] }>> {
  const admin = await requireAdmin();

  const parsed = proposeSchema.safeParse({ locationId, year, confession });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;

  const location = await prisma.location.findUnique({
    where: { id: data.locationId },
    select: { tenantId: true, deletedAt: true },
  });
  if (!location || location.deletedAt) {
    return { ok: false, error: "Standort nicht gefunden." };
  }
  if (location.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diesen Standort." };
  }

  const defs =
    data.confession === "KATHOLISCH"
      ? holidaysForCatholic(data.year)
      : holidaysForReformed(data.year);
  return {
    ok: true,
    data: {
      holidays: defs.map((h) => ({ date: isoDateString(h.date), name: h.name })),
    },
  };
}

export async function acceptProposedHolidaysAction(
  locationId: string,
  year: number,
  holidays: HolidayDraft[],
): Promise<ActionResult<{ added: number; removed: number; updated: number }>> {
  const admin = await requireAdmin();

  const parsed = acceptSchema.safeParse({ locationId, year, holidays });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;
  const { start: yearStart, end: yearEnd } = yearBoundsUtc(data.year);

  const location = await prisma.location.findUnique({
    where: { id: data.locationId },
    select: { tenantId: true, deletedAt: true },
  });
  if (!location || location.deletedAt) {
    return { ok: false, error: "Standort nicht gefunden." };
  }
  if (location.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diesen Standort." };
  }

  const uniqueByDate = new Map<string, string>();
  for (const h of data.holidays) {
    if (!h.date.startsWith(`${data.year}-`)) {
      return {
        ok: false,
        error: `Alle Feiertage müssen im Jahr ${data.year} liegen.`,
        fieldErrors: { holidays: `Ungültiges Datum ${h.date}` },
      };
    }
    uniqueByDate.set(h.date, h.name.trim());
  }
  const desired = Array.from(uniqueByDate.entries()).map(([date, name]) => ({
    date,
    name,
  }));

  const current = await prisma.holiday.findMany({
    where: {
      tenantId: admin.tenantId,
      locationId: data.locationId,
      date: { gte: yearStart, lt: yearEnd },
    },
    orderBy: { date: "asc" },
  });
  const currentByDate = new Map(current.map((h) => [isoDateString(h.date), h]));
  const desiredDateSet = new Set(desired.map((h) => h.date));

  const added: HolidayDraft[] = [];
  const removed: HolidayDraft[] = [];
  const updated: Array<{ date: string; from: string; to: string }> = [];

  for (const item of desired) {
    const existing = currentByDate.get(item.date);
    if (!existing) {
      added.push(item);
      continue;
    }
    if (existing.name !== item.name) {
      updated.push({ date: item.date, from: existing.name, to: item.name });
    }
  }

  for (const row of current) {
    const iso = isoDateString(row.date);
    if (!desiredDateSet.has(iso)) {
      removed.push({ date: iso, name: row.name });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const row of current) {
      const iso = isoDateString(row.date);
      if (!desiredDateSet.has(iso)) {
        await tx.holiday.delete({ where: { id: row.id } });
      }
    }
    for (const item of desired) {
      await tx.holiday.upsert({
        where: {
          locationId_date: {
            locationId: data.locationId,
            date: parseIsoDateToUtc(item.date),
          },
        },
        create: {
          tenantId: admin.tenantId,
          locationId: data.locationId,
          date: parseIsoDateToUtc(item.date),
          name: item.name,
        },
        update: {
          name: item.name,
        },
      });
    }
  });

  await writeAudit({
    userId: admin.id,
    action: "HOLIDAYS_UPDATED",
    entity: "Holiday",
    entityId: data.locationId,
    oldValue: {
      year: data.year,
      locationId: data.locationId,
      holidays: current.map((h) => ({
        date: isoDateString(h.date),
        name: h.name,
      })),
    },
    newValue: {
      year: data.year,
      locationId: data.locationId,
      holidays: desired,
      diff: {
        added,
        removed,
        updated,
      },
    },
  });

  safeRevalidatePath("acceptProposedHolidaysAction", "/settings");
  safeRevalidatePath(
    "acceptProposedHolidaysAction",
    `/locations/${data.locationId}/holidays`,
  );

  return {
    ok: true,
    data: { added: added.length, removed: removed.length, updated: updated.length },
  };
}
