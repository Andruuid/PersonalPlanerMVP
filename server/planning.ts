"use server";

import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  moveSchema,
  QUICK_SHIFT_CODES,
  upsertSchema,
  type UpsertPlanEntryInput,
  type QuickPickKey,
} from "@/lib/planning/plan-entry-schemas";
import {
  DEFAULT_HALF_DAY_OFF_MINUTES,
  resolveDayFromEntries,
  type AbsenceType,
  type PlanEntryInput,
} from "@/lib/time/priority";
import {
  requireAdmin,
  fieldErrorsFromZod,
  actionErrorFromDatabase,
  logServerError,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";
import { archiveUntil } from "@/lib/archive";
import { maybeSweepErtAfterPlanWrite } from "@/lib/ert/sweep";
import { isoDateString, parseIsoDate } from "@/lib/time/week";
import { shiftMinutes } from "@/lib/planning/shift-minutes";
import { buildWeekSnapshot } from "./weeks";
import { logDebug } from "@/lib/logging";

/** Abwesenheiten, die in PUBLISHED-KW bei geänderter Tagespriorität einen neuen Snapshot auslösen. */
const AUTO_REPUBLISH_TRIGGER_ABSENCES = new Set<AbsenceType>([
  "SICK",
  "ACCIDENT",
  "PARENTAL_CARE",
  "MILITARY_SERVICE",
  "CIVIL_PROTECTION_SERVICE",
  "CIVIL_SERVICE",
]);

function isWeekendIso(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

function planRowToInput(e: {
  kind: string;
  absenceType: string | null;
  plannedMinutes: number;
}): PlanEntryInput {
  return {
    kind: e.kind as PlanEntryInput["kind"],
    absenceType: e.absenceType as AbsenceType | null,
    plannedMinutes: e.plannedMinutes,
  };
}

function resolvedDayEqual(
  a: { kind: string; plannedMinutes: number },
  b: { kind: string; plannedMinutes: number },
): boolean {
  return a.kind === b.kind && a.plannedMinutes === b.plannedMinutes;
}

async function ensureWeekEditable(weekId: string, tenantId: string): Promise<ActionResult | null> {
  const week = await prisma.week.findFirst({
    where: { id: weekId, tenantId, deletedAt: null },
  });
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
): Promise<ActionResult<{ autoRepublished?: boolean }>> {
  const admin = await requireAdmin();
  logDebug("planning:upsert", "Start upsertPlanEntryAction", {
    tenantId: admin.tenantId,
    weekId: input.weekId,
    employeeId: input.employeeId,
    date: input.date,
    kind: input.kind,
  });

  try {
    const parsed = upsertSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Bitte Eingaben prüfen.",
        fieldErrors: fieldErrorsFromZod(parsed.error),
      };
    }
    const data = parsed.data;

    const editable = await ensureWeekEditable(data.weekId, admin.tenantId);
    if (editable) return editable;

    const date = parseIsoDate(data.date);
    if (!date) return { ok: false, error: "Datum ungültig." };

    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
      select: {
        id: true,
        tenantId: true,
        isActive: true,
        deletedAt: true,
        locationId: true,
        tztModel: true,
      },
    });
    if (!employee || employee.tenantId !== admin.tenantId) {
      return { ok: false, error: "Mitarbeitende:r nicht gefunden." };
    }
    if (employee.deletedAt) {
      return { ok: false, error: "Mitarbeitende:r ist archiviert." };
    }

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
      | "UEZ_BEZUG"
      | "UNPAID"
      | "TZT"
      | "PARENTAL_CARE"
      | "MILITARY_SERVICE"
      | "CIVIL_PROTECTION_SERVICE"
      | "CIVIL_SERVICE"
      | "HOLIDAY_AUTO"
      | null = null;

    if (data.kind === "SHIFT") {
      const tpl = await prisma.serviceTemplate.findUnique({
        where: { id: data.serviceTemplateId },
      });
      if (
        !tpl ||
        tpl.deletedAt ||
        !tpl.isActive ||
        tpl.tenantId !== admin.tenantId
      ) {
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
    } else if (data.kind === "ABSENCE") {
      absenceType = data.absenceType;
      if (
        absenceType === "TZT" &&
        employee.tztModel === "TARGET_REDUCTION"
      ) {
        return {
          ok: false,
          error:
            "TZT-Bezug nicht vorgesehen (Modell Sollzeit-Reduktion).",
        };
      }
    } else if (data.kind === "HALF_DAY_OFF") {
      plannedMinutes = DEFAULT_HALF_DAY_OFF_MINUTES;
    }

    let autoRepublished = false;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.planEntry.findFirst({
        where: {
          weekId: data.weekId,
          employeeId: data.employeeId,
          date,
          deletedAt: null,
        },
      });

      const created = existing
        ? await tx.planEntry.update({
            where: { id: existing.id },
            data: {
              kind: data.kind,
              serviceTemplateId,
              oneTimeStart,
              oneTimeEnd,
              oneTimeBreakMinutes,
              oneTimeLabel,
              absenceType,
              plannedMinutes,
              comment: data.comment ?? null,
              deletedAt: null,
              archivedUntil: null,
            },
          })
        : await tx.planEntry.create({
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

    if (
      data.kind === "ABSENCE" &&
      absenceType &&
      AUTO_REPUBLISH_TRIGGER_ABSENCES.has(absenceType)
    ) {
      const weekRow = await prisma.week.findFirst({
        where: { id: data.weekId, tenantId: admin.tenantId, deletedAt: null },
        select: { id: true, status: true },
      });
      if (weekRow?.status === "PUBLISHED") {
        const holiday = await prisma.holiday.findFirst({
          where: {
            tenantId: admin.tenantId,
            locationId: employee.locationId,
            date,
          },
          select: { id: true },
        });
        const isHoliday = Boolean(holiday);
        const isWeekend = isWeekendIso(data.date);
        const beforeRows = result.replaced ? [planRowToInput(result.replaced)] : [];
        const afterRows = [planRowToInput(result.created)];
        const resolvedBefore = resolveDayFromEntries(
          beforeRows,
          isHoliday,
          isWeekend,
        );
        const resolvedAfter = resolveDayFromEntries(
          afterRows,
          isHoliday,
          isWeekend,
        );
        if (!resolvedDayEqual(resolvedBefore, resolvedAfter)) {
          const snapshot = await buildWeekSnapshot(data.weekId, admin.tenantId);
          const publishedAt = new Date();
          await prisma.publishedSnapshot.create({
            data: {
              tenantId: admin.tenantId,
              weekId: data.weekId,
              snapshotJson: JSON.stringify(snapshot),
              publishedAt,
            },
          });
          await writeAudit({
            userId: admin.id,
            action: "REPUBLISH_AUTO",
            entity: "Week",
            entityId: weekRow.id,
            comment:
              "Auto-Republish wegen prioritätsverändernden Eintrags (SICK/ACCIDENT)",
          });
          autoRepublished = true;
          safeRevalidatePath("upsertPlanEntryAction", "/my-week");
        }
      }
    }

    await maybeSweepErtAfterPlanWrite(
      prisma,
      admin.tenantId,
      data.employeeId,
      data.date,
    );

    safeRevalidatePath("upsertPlanEntryAction", "/planning");
    logDebug("planning:upsert", "upsertPlanEntryAction succeeded", {
      tenantId: admin.tenantId,
      weekId: data.weekId,
      employeeId: data.employeeId,
      autoRepublished,
    });
    return {
      ok: true,
      data: autoRepublished ? { autoRepublished: true } : undefined,
    };
  } catch (err) {
    logServerError("upsertPlanEntryAction", err);
    return { ok: false, error: actionErrorFromDatabase(err) };
  }
}

export async function deletePlanEntryAction(
  weekId: string,
  employeeId: string,
  isoDate: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  logDebug("planning:delete", "Start deletePlanEntryAction", {
    tenantId: admin.tenantId,
    weekId,
    employeeId,
    isoDate,
  });

  try {
    const editable = await ensureWeekEditable(weekId, admin.tenantId);
    if (editable) return editable;

    const date = parseIsoDate(isoDate);
    if (!date) return { ok: false, error: "Datum ungültig." };

    const existing = await prisma.planEntry.findFirst({
      where: { weekId, employeeId, date, deletedAt: null },
    });
    if (!existing) return { ok: true };

    await prisma.planEntry.update({
      where: { id: existing.id },
      data: {
        deletedAt: new Date(),
        archivedUntil: archiveUntil(),
      },
    });

    await writeAudit({
      userId: admin.id,
      action: "DELETE",
      entity: "PlanEntry",
      entityId: existing.id,
      oldValue: entrySnapshot(existing),
    });

    await maybeSweepErtAfterPlanWrite(
      prisma,
      admin.tenantId,
      employeeId,
      isoDate,
    );

    safeRevalidatePath("deletePlanEntryAction", "/planning");
    logDebug("planning:delete", "deletePlanEntryAction succeeded", {
      tenantId: admin.tenantId,
      weekId,
      employeeId,
      isoDate,
    });
    return { ok: true };
  } catch (err) {
    logServerError("deletePlanEntryAction", err);
    return { ok: false, error: actionErrorFromDatabase(err) };
  }
}

export async function quickSetPlanEntryAction(
  weekId: string,
  employeeId: string,
  isoDate: string,
  pick: QuickPickKey,
): Promise<ActionResult<{ autoRepublished?: boolean }>> {
  const admin = await requireAdmin();
  logDebug("planning:quick-set", "Start quickSetPlanEntryAction", {
    tenantId: admin.tenantId,
    weekId,
    employeeId,
    isoDate,
    pick,
  });
  try {
    if (QUICK_SHIFT_CODES.includes(pick as (typeof QUICK_SHIFT_CODES)[number])) {
      const tpl = await prisma.serviceTemplate.findUnique({
        where: {
          tenantId_code: { tenantId: admin.tenantId, code: pick },
        },
        select: { id: true, isActive: true, deletedAt: true },
      });
      if (!tpl || !tpl.isActive || tpl.deletedAt) {
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
      absenceType: pick as
        | "VACATION"
        | "FREE_REQUESTED"
        | "UEZ_BEZUG"
        | "TZT"
        | "SICK",
    });
  } catch (err) {
    logServerError("quickSetPlanEntryAction", err);
    return { ok: false, error: actionErrorFromDatabase(err) };
  }
}

export async function movePlanEntryAction(
  entryId: string,
  toEmployeeId: string,
  toIsoDate: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  logDebug("planning:move", "Start movePlanEntryAction", {
    tenantId: admin.tenantId,
    entryId,
    toEmployeeId,
    toIsoDate,
  });

  try {
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
      include: { week: { select: { tenantId: true } } },
    });
    if (!entry || entry.week.tenantId !== admin.tenantId) {
      return { ok: false, error: "Eintrag nicht gefunden." };
    }
    if (entry.deletedAt) return { ok: false, error: "Eintrag ist archiviert." };

    const editable = await ensureWeekEditable(entry.weekId, admin.tenantId);
    if (editable) return editable;

    const newDate = parseIsoDate(toIsoDate);
    if (!newDate) return { ok: false, error: "Datum ungültig." };

    const targetEmployee = await prisma.employee.findUnique({
      where: { id: toEmployeeId },
      select: { tenantId: true, deletedAt: true },
    });
    if (
      !targetEmployee ||
      targetEmployee.tenantId !== admin.tenantId ||
      targetEmployee.deletedAt
    ) {
      return { ok: false, error: "Mitarbeitende:r nicht gefunden." };
    }

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
          deletedAt: null,
        },
      });
      if (target) {
        await tx.planEntry.update({
          where: { id: target.id },
          data: {
            deletedAt: new Date(),
            archivedUntil: archiveUntil(),
          },
        });
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

    await maybeSweepErtAfterPlanWrite(
      prisma,
      admin.tenantId,
      entry.employeeId,
      isoDateString(entry.date),
    );
    await maybeSweepErtAfterPlanWrite(prisma, admin.tenantId, toEmployeeId, toIsoDate);

    safeRevalidatePath("movePlanEntryAction", "/planning");
    logDebug("planning:move", "movePlanEntryAction succeeded", {
      tenantId: admin.tenantId,
      entryId,
      toEmployeeId,
      toIsoDate,
    });
    return { ok: true };
  } catch (err) {
    logServerError("movePlanEntryAction", err);
    return { ok: false, error: actionErrorFromDatabase(err) };
  }
}
