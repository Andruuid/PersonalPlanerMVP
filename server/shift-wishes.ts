"use server";

import { getISOWeek, getISOWeekYear } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { archiveUntil } from "@/lib/archive";
import { shiftMinutes } from "@/lib/planning/shift-minutes";
import { isoDateString, parseIsoDate } from "@/lib/time/week";
import { maybeSweepErtAfterPlanWrite } from "@/lib/ert/sweep";
import { parseDecisionComment } from "@/server/decision-comment";
import {
  fieldErrorsFromZod,
  readOptionalString,
  requireAdmin,
  requireEmployee,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const shiftWishTemplateSchema = z.object({
  wishKind: z.literal("template"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum erforderlich (YYYY-MM-DD)"),
  preferredServiceTemplateId: z.string().min(1, "Dienstvorlage wählen"),
  comment: z.string().max(500).optional().nullable(),
});

const shiftWishOneTimeSchema = z.object({
  wishKind: z.literal("one_time"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum erforderlich (YYYY-MM-DD)"),
  preferredOneTimeLabel: z
    .string()
    .min(1, "Bezeichnung erforderlich")
    .max(60),
  oneTimeStart: z.string().regex(TIME_RE, "Beginn HH:MM"),
  oneTimeEnd: z.string().regex(TIME_RE, "Ende HH:MM"),
  oneTimeBreakMinutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(240),
  comment: z.string().max(500).optional().nullable(),
});

const createShiftWishSchema = z.discriminatedUnion("wishKind", [
  shiftWishTemplateSchema,
  shiftWishOneTimeSchema,
]);

interface IsoWeekKey {
  year: number;
  weekNumber: number;
}

interface WeeksTouchedSummary {
  year: number;
  weekNumber: number;
  status: "DRAFT" | "REOPENED" | "PUBLISHED" | "CLOSED";
}

async function resolveWeekStatus(
  tenantId: string,
  key: IsoWeekKey,
): Promise<WeeksTouchedSummary["status"]> {
  const row = await prisma.week.findFirst({
    where: { tenantId, year: key.year, weekNumber: key.weekNumber },
    select: { status: true },
  });
  return row?.status ?? "DRAFT";
}

function revalidateWishPaths(reason: string) {
  safeRevalidatePath(reason, "/planning");
  safeRevalidatePath(reason, "/absences");
  safeRevalidatePath(reason, "/my-requests");
  safeRevalidatePath(reason, "/my-week");
}

export async function createShiftWishAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const employee = await requireEmployee();
  const employeeId = employee.employeeId;
  if (!employeeId) {
    return {
      ok: false,
      error: "Kein Mitarbeitenden-Profil verknüpft.",
    };
  }

  const wishKindRaw = readOptionalString(formData.get("wishKind"));
  const common = {
    date: readOptionalString(formData.get("date")) ?? "",
    comment: readOptionalString(formData.get("comment")),
  };

  const raw =
    wishKindRaw === "one_time"
      ? {
          wishKind: "one_time" as const,
          ...common,
          preferredOneTimeLabel:
            readOptionalString(formData.get("preferredOneTimeLabel")) ?? "",
          oneTimeStart: readOptionalString(formData.get("oneTimeStart")) ?? "",
          oneTimeEnd: readOptionalString(formData.get("oneTimeEnd")) ?? "",
          oneTimeBreakMinutes: formData.get("oneTimeBreakMinutes"),
        }
      : {
          wishKind: "template" as const,
          ...common,
          preferredServiceTemplateId:
            readOptionalString(formData.get("preferredServiceTemplateId")) ??
            "",
        };

  const parsed = createShiftWishSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const data = parsed.data;
  const day = parseIsoDate(data.date);
  if (!day) {
    return { ok: false, error: "Datum ungültig." };
  }

  if (
    !(await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: employee.tenantId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    }))
  ) {
    return {
      ok: false,
      error: "Profil nicht verfügbar — bitte Support kontaktieren.",
    };
  }

  const dupOpen = await prisma.shiftWish.findFirst({
    where: {
      employeeId,
      tenantId: employee.tenantId,
      date: day,
      deletedAt: null,
      status: "OPEN",
    },
    select: { id: true },
  });
  if (dupOpen) {
    return {
      ok: false,
      error:
        "Du hast für dieses Datum bereits einen offenen Schicht-Wunsch. Bitte zuerst warten oder die Geschäftsleitung kontaktieren.",
    };
  }

  if (data.wishKind === "template") {
    const tpl = await prisma.serviceTemplate.findFirst({
      where: {
        id: data.preferredServiceTemplateId,
        tenantId: employee.tenantId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    if (!tpl) {
      return {
        ok: false,
        error: "Dienstvorlage nicht gefunden oder nicht verfügbar.",
      };
    }
  }

  const created = await prisma.shiftWish.create({
    data:
      data.wishKind === "template"
        ? {
            tenantId: employee.tenantId,
            employeeId,
            date: day,
            preferredServiceTemplateId: data.preferredServiceTemplateId,
            comment: data.comment ?? null,
            status: "OPEN",
          }
        : {
            tenantId: employee.tenantId,
            employeeId,
            date: day,
            preferredOneTimeLabel: data.preferredOneTimeLabel,
            oneTimeStart: data.oneTimeStart,
            oneTimeEnd: data.oneTimeEnd,
            oneTimeBreakMinutes: data.oneTimeBreakMinutes,
            comment: data.comment ?? null,
            status: "OPEN",
          },
  });

  await writeAudit({
    userId: employee.id,
    action: "CREATE",
    entity: "ShiftWish",
    entityId: created.id,
    newValue: {
      date: data.date,
      wishKind: data.wishKind,
      preferredServiceTemplateId:
        data.wishKind === "template"
          ? data.preferredServiceTemplateId
          : null,
      oneTimeLabel:
        data.wishKind === "one_time" ? data.preferredOneTimeLabel : null,
    },
  });

  revalidateWishPaths("createShiftWishAction");
  return { ok: true };
}

export async function approveShiftWishAction(
  wishId: string,
  decisionComment?: string | null,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsedComment = parseDecisionComment(decisionComment);
  if (!parsedComment.ok) {
    return { ok: false, error: parsedComment.error };
  }

  const wish = await prisma.shiftWish.findUnique({
    where: { id: wishId },
  });
  if (!wish || wish.tenantId !== admin.tenantId) {
    return { ok: false, error: "Wunsch nicht gefunden." };
  }
  if (wish.deletedAt) {
    return { ok: false, error: "Wunsch nicht gefunden." };
  }
  if (wish.status !== "OPEN") {
    return { ok: false, error: "Wunsch wurde bereits bearbeitet." };
  }

  const emp = await prisma.employee.findFirst({
    where: {
      id: wish.employeeId,
      tenantId: admin.tenantId,
      isActive: true,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!emp) {
    return { ok: false, error: "Mitarbeitende:r ist archiviert." };
  }

  const day = wish.date;
  const year = getISOWeekYear(day);
  const weekNumber = getISOWeek(day);
  const touchedStatus = await resolveWeekStatus(admin.tenantId, {
    year,
    weekNumber,
  });
  const weeksTouched: WeeksTouchedSummary[] = [
    { year, weekNumber, status: touchedStatus },
  ];

  if (touchedStatus === "CLOSED") {
    return {
      ok: false,
      error:
        "Die betroffene Woche ist abgeschlossen — Schicht-Wunsch kann nicht genehmigt werden. Bitte die Woche zuerst wieder öffnen.",
    };
  }

  let replacedEntryCount = 0;
  const replacedEntrySamples: Array<{
    date: string;
    previousKind: string;
    previousAbsenceType: string | null;
  }> = [];

  const isTemplateWish = Boolean(wish.preferredServiceTemplateId);
  let templateForPlan: {
    id: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
  } | null = null;

  if (isTemplateWish) {
    templateForPlan = await prisma.serviceTemplate.findFirst({
      where: {
        id: wish.preferredServiceTemplateId!,
        tenantId: admin.tenantId,
        deletedAt: null,
        isActive: true,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
      },
    });
    if (!templateForPlan) {
      return {
        ok: false,
        error:
          "Dienstvorlage nicht mehr verfügbar — bitte ablehnen oder Vorlage wiederherstellen.",
      };
    }
  } else {
    if (
      !wish.preferredOneTimeLabel ||
      !wish.oneTimeStart ||
      !wish.oneTimeEnd ||
      wish.oneTimeBreakMinutes == null
    ) {
      return {
        ok: false,
        error: "Einmal-Schicht-Wunsch ist unvollständig gespeichert.",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
    const weekRow = await tx.week.findUnique({
      where: {
        tenantId_year_weekNumber: {
          tenantId: admin.tenantId,
          year,
          weekNumber,
        },
      },
    });
    const week = weekRow
      ? weekRow.deletedAt
        ? await tx.week.update({
            where: { id: weekRow.id },
            data: { deletedAt: null, archivedUntil: null },
          })
        : weekRow
      : await tx.week.create({
          data: { tenantId: admin.tenantId, year, weekNumber, status: "DRAFT" },
        });

    if (week.status === "CLOSED") {
      throw new Error("CLOSED_WEEK_RACE");
    }

    const existing = await tx.planEntry.findFirst({
      where: {
        weekId: week.id,
        employeeId: wish.employeeId,
        date: day,
        deletedAt: null,
      },
      select: {
        id: true,
        kind: true,
        absenceType: true,
        date: true,
      },
    });
    if (existing) {
      replacedEntryCount += 1;
      replacedEntrySamples.push({
        date: isoDateString(existing.date),
        previousKind: existing.kind,
        previousAbsenceType: existing.absenceType ?? null,
      });
      await tx.planEntry.update({
        where: { id: existing.id },
        data: { deletedAt: new Date(), archivedUntil: archiveUntil() },
      });
    }

    if (isTemplateWish && templateForPlan) {
      const plannedMinutes = shiftMinutes(
        templateForPlan.startTime,
        templateForPlan.endTime,
        templateForPlan.breakMinutes,
      );
      await tx.planEntry.create({
        data: {
          weekId: week.id,
          employeeId: wish.employeeId,
          date: day,
          kind: "SHIFT",
          serviceTemplateId: templateForPlan.id,
          plannedMinutes,
          comment: wish.comment,
        },
      });
    } else {
      const plannedMinutes = shiftMinutes(
        wish.oneTimeStart!,
        wish.oneTimeEnd!,
        wish.oneTimeBreakMinutes!,
      );
      await tx.planEntry.create({
        data: {
          weekId: week.id,
          employeeId: wish.employeeId,
          date: day,
          kind: "ONE_TIME_SHIFT",
          oneTimeStart: wish.oneTimeStart,
          oneTimeEnd: wish.oneTimeEnd,
          oneTimeBreakMinutes: wish.oneTimeBreakMinutes,
          oneTimeLabel: wish.preferredOneTimeLabel,
          plannedMinutes,
          comment: wish.comment,
        },
      });
    }

    await tx.shiftWish.update({
      where: { id: wishId },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        decidedById: admin.id,
        decisionComment: parsedComment.text,
      },
    });
  });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "CLOSED_WEEK_RACE") {
      return {
        ok: false,
        error:
          "Die Woche wurde inzwischen abgeschlossen — bitte erneut prüfen.",
      };
    }
    throw err;
  }

  await maybeSweepErtAfterPlanWrite(
    prisma,
    admin.tenantId,
    wish.employeeId,
    isoDateString(day),
  );

  await writeAudit({
    userId: admin.id,
    action: "APPROVE",
    entity: "ShiftWish",
    entityId: wishId,
    oldValue: {
      status: wish.status,
      decisionComment: wish.decisionComment ?? null,
    },
    newValue: {
      status: "APPROVED",
      date: isoDateString(wish.date),
      kind: isTemplateWish ? "SHIFT" : "ONE_TIME_SHIFT",
      replacedPlanEntries: replacedEntryCount,
      replacedPlanEntrySamples: replacedEntrySamples,
      weeksTouched,
      decisionComment: parsedComment.text,
    },
  });

  revalidateWishPaths("approveShiftWishAction");
  return { ok: true };
}

export async function rejectShiftWishAction(
  wishId: string,
  reason?: string | null,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsedReason = parseDecisionComment(reason);
  if (!parsedReason.ok) {
    return { ok: false, error: parsedReason.error };
  }

  const wish = await prisma.shiftWish.findUnique({
    where: { id: wishId },
  });
  if (!wish || wish.tenantId !== admin.tenantId) {
    return { ok: false, error: "Wunsch nicht gefunden." };
  }
  if (wish.deletedAt) {
    return { ok: false, error: "Wunsch nicht gefunden." };
  }
  if (wish.status !== "OPEN") {
    return { ok: false, error: "Wunsch wurde bereits bearbeitet." };
  }

  const year = getISOWeekYear(wish.date);
  const weekNumber = getISOWeek(wish.date);
  const status = await resolveWeekStatus(admin.tenantId, { year, weekNumber });
  const weeksTouched: WeeksTouchedSummary[] = [
    { year, weekNumber, status },
  ];
  const touchedClosedWeek = status === "CLOSED";

  await prisma.shiftWish.update({
    where: { id: wishId },
    data: {
      status: "REJECTED",
      decidedAt: new Date(),
      decidedById: admin.id,
      decisionComment: parsedReason.text,
    },
  });

  await writeAudit({
    userId: admin.id,
    action: "REJECT",
    entity: "ShiftWish",
    entityId: wishId,
    oldValue: {
      status: wish.status,
      decisionComment: wish.decisionComment ?? null,
    },
    newValue: {
      status: "REJECTED",
      weeksTouched,
      touchedClosedWeek,
      decisionComment: parsedReason.text,
    },
  });

  revalidateWishPaths("rejectShiftWishAction");
  return { ok: true };
}
