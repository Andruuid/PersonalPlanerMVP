"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  moveSchema,
  QUICK_SHIFT_CODES,
  upsertSchema,
  type UpsertPlanEntryInput,
  type QuickPickKey,
} from "@/lib/planning/plan-entry-schemas";
import { isoDateString, parseIsoDate } from "@/lib/time/week";
import {
  requireAdmin,
  fieldErrorsFromZod,
  type ActionResult,
} from "./_shared";

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map((p) => Number.parseInt(p, 10));
  return h * 60 + m;
}

function shiftMinutes(
  start: string,
  end: string,
  breakMinutes: number,
): number {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  const span = e >= s ? e - s : 24 * 60 - s + e;
  return Math.max(0, span - breakMinutes);
}

async function ensureWeekEditable(weekId: string): Promise<ActionResult | null> {
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) return { ok: false, error: "Woche nicht gefunden." };
  if (week.status === "CLOSED") {
    return {
      ok: false,
      error: "Abgeschlossene Wochen können nicht bearbeitet werden.",
    };
  }
  return null;
}

interface PlanEntrySnapshot {
  id: string;
  kind: string;
  serviceTemplateId: string | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  oneTimeBreakMinutes: number | null;
  oneTimeLabel: string | null;
  absenceType: string | null;
  plannedMinutes: number;
  comment: string | null;
}

function entrySnapshot(entry: {
  id: string;
  kind: string;
  serviceTemplateId: string | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  oneTimeBreakMinutes: number | null;
  oneTimeLabel: string | null;
  absenceType: string | null;
  plannedMinutes: number;
  comment: string | null;
}): PlanEntrySnapshot {
  return {
    id: entry.id,
    kind: entry.kind,
    serviceTemplateId: entry.serviceTemplateId,
    oneTimeStart: entry.oneTimeStart,
    oneTimeEnd: entry.oneTimeEnd,
    oneTimeBreakMinutes: entry.oneTimeBreakMinutes,
    oneTimeLabel: entry.oneTimeLabel,
    absenceType: entry.absenceType,
    plannedMinutes: entry.plannedMinutes,
    comment: entry.comment,
  };
}

export async function upsertPlanEntryAction(
  input: UpsertPlanEntryInput,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;

  const editable = await ensureWeekEditable(data.weekId);
  if (editable) return editable;

  const date = parseIsoDate(data.date);
  if (!date) return { ok: false, error: "Datum ungültig." };

  const employee = await prisma.employee.findUnique({
    where: { id: data.employeeId },
    select: { id: true, isActive: true },
  });
  if (!employee) return { ok: false, error: "Mitarbeitende:r nicht gefunden." };

  let plannedMinutes = 0;
  let serviceTemplateId: string | null = null;
  let oneTimeStart: string | null = null;
  let oneTimeEnd: string | null = null;
  let oneTimeBreakMinutes: number | null = null;
  let oneTimeLabel: string | null = null;
  let absenceType:
    | "VACATION"
    | "SICK"
    | "ACCIDENT"
    | "FREE_REQUESTED"
    | "UNPAID"
    | "TZT"
    | "HOLIDAY_AUTO"
    | null = null;

  if (data.kind === "SHIFT") {
    const tpl = await prisma.serviceTemplate.findUnique({
      where: { id: data.serviceTemplateId },
    });
    if (!tpl || !tpl.isActive) {
      return {
        ok: false,
        error: "Dienstvorlage nicht gefunden oder inaktiv.",
      };
    }
    serviceTemplateId = tpl.id;
    plannedMinutes = shiftMinutes(tpl.startTime, tpl.endTime, tpl.breakMinutes);
  } else if (data.kind === "ONE_TIME_SHIFT") {
    oneTimeStart = data.oneTimeStart;
    oneTimeEnd = data.oneTimeEnd;
    oneTimeBreakMinutes = data.oneTimeBreakMinutes;
    oneTimeLabel = data.oneTimeLabel;
    plannedMinutes = shiftMinutes(
      data.oneTimeStart,
      data.oneTimeEnd,
      data.oneTimeBreakMinutes,
    );
  } else {
    absenceType = data.absenceType;
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.planEntry.findFirst({
      where: {
        weekId: data.weekId,
        employeeId: data.employeeId,
        date,
      },
    });

    if (existing) {
      await tx.planEntry.delete({ where: { id: existing.id } });
    }

    const created = await tx.planEntry.create({
      data: {
        weekId: data.weekId,
        employeeId: data.employeeId,
        date,
        kind: data.kind,
        serviceTemplateId,
        oneTimeStart,
        oneTimeEnd,
        oneTimeBreakMinutes,
        oneTimeLabel,
        absenceType,
        plannedMinutes,
        comment: data.comment ?? null,
      },
    });

    return { created, replaced: existing };
  });

  await writeAudit({
    userId: admin.id,
    action: result.replaced ? "UPDATE" : "CREATE",
    entity: "PlanEntry",
    entityId: result.created.id,
    oldValue: result.replaced ? entrySnapshot(result.replaced) : undefined,
    newValue: entrySnapshot(result.created),
    comment: data.comment ?? null,
  });

  revalidatePath("/planning");
  return { ok: true };
}

export async function deletePlanEntryAction(
  weekId: string,
  employeeId: string,
  isoDate: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const editable = await ensureWeekEditable(weekId);
  if (editable) return editable;

  const date = parseIsoDate(isoDate);
  if (!date) return { ok: false, error: "Datum ungültig." };

  const existing = await prisma.planEntry.findFirst({
    where: { weekId, employeeId, date },
  });
  if (!existing) return { ok: true };

  await prisma.planEntry.delete({ where: { id: existing.id } });

  await writeAudit({
    userId: admin.id,
    action: "DELETE",
    entity: "PlanEntry",
    entityId: existing.id,
    oldValue: entrySnapshot(existing),
  });

  revalidatePath("/planning");
  return { ok: true };
}

export async function quickSetPlanEntryAction(
  weekId: string,
  employeeId: string,
  isoDate: string,
  pick: QuickPickKey,
): Promise<ActionResult> {
  if (QUICK_SHIFT_CODES.includes(pick as (typeof QUICK_SHIFT_CODES)[number])) {
    const tpl = await prisma.serviceTemplate.findUnique({
      where: { code: pick },
      select: { id: true, isActive: true },
    });
    if (!tpl || !tpl.isActive) {
      return {
        ok: false,
        error: `Dienstvorlage ${pick} nicht gefunden.`,
      };
    }
    return upsertPlanEntryAction({
      weekId,
      employeeId,
      date: isoDate,
      kind: "SHIFT",
      serviceTemplateId: tpl.id,
    });
  }

  return upsertPlanEntryAction({
    weekId,
    employeeId,
    date: isoDate,
    kind: "ABSENCE",
    absenceType: pick as "VACATION" | "FREE_REQUESTED" | "TZT" | "SICK",
  });
}

export async function movePlanEntryAction(
  entryId: string,
  toEmployeeId: string,
  toIsoDate: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = moveSchema.safeParse({
    entryId,
    toEmployeeId,
    toDate: toIsoDate,
  });
  if (!parsed.success) {
    return { ok: false, error: "Ungültige Verschiebung." };
  }

  const entry = await prisma.planEntry.findUnique({
    where: { id: entryId },
  });
  if (!entry) return { ok: false, error: "Eintrag nicht gefunden." };

  const editable = await ensureWeekEditable(entry.weekId);
  if (editable) return editable;

  const newDate = parseIsoDate(toIsoDate);
  if (!newDate) return { ok: false, error: "Datum ungültig." };

  const sameSlot =
    entry.employeeId === toEmployeeId &&
    isoDateString(entry.date) === toIsoDate;
  if (sameSlot) return { ok: true };

  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.planEntry.findFirst({
      where: {
        weekId: entry.weekId,
        employeeId: toEmployeeId,
        date: newDate,
      },
    });
    if (target) {
      await tx.planEntry.delete({ where: { id: target.id } });
    }
    const moved = await tx.planEntry.update({
      where: { id: entryId },
      data: { employeeId: toEmployeeId, date: newDate },
    });
    return { moved, replaced: target };
  });

  await writeAudit({
    userId: admin.id,
    action: "MOVE",
    entity: "PlanEntry",
    entityId: result.moved.id,
    oldValue: {
      employeeId: entry.employeeId,
      date: isoDateString(entry.date),
      replaced: result.replaced ? entrySnapshot(result.replaced) : null,
    },
    newValue: {
      employeeId: result.moved.employeeId,
      date: isoDateString(result.moved.date),
    },
  });

  revalidatePath("/planning");
  return { ok: true };
}
