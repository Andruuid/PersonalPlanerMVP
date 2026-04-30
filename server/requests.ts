"use server";

import { addDays, format, getISOWeek, getISOWeekYear } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { isoDateString, parseIsoDate } from "@/lib/time/week";
import {
  evaluateRequestEntitlement,
  requestedSollDaysByYear,
  type RequestEntitlementInput,
  type RequestAccountType,
} from "@/lib/requests/entitlement";
import { effectiveStandardWorkDays } from "@/lib/time/soll";
import {
  fieldErrorsFromZod,
  readOptionalString,
  requireAdmin,
  requireEmployee,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";
import { parseDecisionComment } from "@/server/decision-comment";
import { softDeleteFields } from "@/lib/archive";

const REQUEST_TO_ABSENCE: Record<
  | "VACATION"
  | "FREE_REQUESTED"
  | "UEZ_BEZUG"
  | "TZT"
  | "FREE_DAY"
  | "PARENTAL_CARE",
  | "VACATION"
  | "FREE_REQUESTED"
  | "UEZ_BEZUG"
  | "TZT"
  | "UNPAID"
  | "PARENTAL_CARE"
> = {
  VACATION: "VACATION",
  FREE_REQUESTED: "FREE_REQUESTED",
  UEZ_BEZUG: "UEZ_BEZUG",
  TZT: "TZT",
  // "Freier Tag" should behave like a regular free-requested day
  // (Zeitsaldo impact), not like unpaid leave (Soll reduction).
  FREE_DAY: "FREE_REQUESTED",
  PARENTAL_CARE: "PARENTAL_CARE",
};

function* daysInRange(start: Date, end: Date): Generator<Date> {
  const total =
    Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  for (let i = 0; i < total; i++) {
    yield addDays(start, i);
  }
}

interface IsoWeekKey {
  year: number;
  weekNumber: number;
}

function isoWeeksInRange(start: Date, end: Date): IsoWeekKey[] {
  const seen = new Set<string>();
  const out: IsoWeekKey[] = [];
  for (const day of daysInRange(start, end)) {
    const year = getISOWeekYear(day);
    const weekNumber = getISOWeek(day);
    const key = `${year}-${weekNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ year, weekNumber });
    }
  }
  return out;
}

interface WeeksTouchedSummary {
  year: number;
  weekNumber: number;
  status: "DRAFT" | "REOPENED" | "PUBLISHED" | "CLOSED";
}

/**
 * Resolves the status of every ISO week that the request range touches. Weeks
 * that don't yet exist in the DB are reported as DRAFT (their effective state
 * before any planning has happened).
 */
async function resolveWeeksTouched(
  tenantId: string,
  weekKeys: IsoWeekKey[],
): Promise<WeeksTouchedSummary[]> {
  if (weekKeys.length === 0) return [];
  const rows = await prisma.week.findMany({
    where: {
      tenantId,
      OR: weekKeys.map(({ year, weekNumber }) => ({ year, weekNumber })),
    },
    select: { year: true, weekNumber: true, status: true },
  });
  const byKey = new Map<string, WeeksTouchedSummary["status"]>();
  for (const row of rows) {
    byKey.set(`${row.year}-${row.weekNumber}`, row.status);
  }
  return weekKeys.map(({ year, weekNumber }) => ({
    year,
    weekNumber,
    status: byKey.get(`${year}-${weekNumber}`) ?? "DRAFT",
  }));
}

export async function approveRequestAction(
  requestId: string,
  decisionComment?: string | null,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsedComment = parseDecisionComment(decisionComment);
  if (!parsedComment.ok) {
    return { ok: false, error: parsedComment.error };
  }

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.tenantId !== admin.tenantId) {
    return { ok: false, error: "Antrag nicht gefunden." };
  }
  if (request.deletedAt) {
    return { ok: false, error: "Antrag nicht gefunden." };
  }
  if (request.status !== "OPEN") {
    return { ok: false, error: "Antrag wurde bereits bearbeitet." };
  }
  const employee = await prisma.employee.findFirst({
    where: {
      id: request.employeeId,
      tenantId: admin.tenantId,
      status: "AKTIV",
    },
    select: { id: true },
  });
  if (!employee) {
    return { ok: false, error: "Mitarbeitende:r ist archiviert." };
  }

  const weekKeys = isoWeeksInRange(request.startDate, request.endDate);
  const weeksTouched = await resolveWeeksTouched(admin.tenantId, weekKeys);
  if (weeksTouched.some((w) => w.status === "CLOSED")) {
    return {
      ok: false,
      error:
        "Antrag berührt eine abgeschlossene Woche und kann so nicht genehmigt werden. Bitte Woche zuerst wieder öffnen oder Antrag passend zuschneiden.",
    };
  }

  const absenceType = REQUEST_TO_ABSENCE[request.type];
  let replacedEntryCount = 0;
  const replacedEntrySamples: Array<{
    date: string;
    previousKind: string;
    previousAbsenceType: string | null;
  }> = [];

  await prisma.$transaction(async (tx) => {
    for (const day of daysInRange(request.startDate, request.endDate)) {
      const year = getISOWeekYear(day);
      const weekNumber = getISOWeek(day);
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
              data: { deletedAt: null, archivedUntil: null, deletedById: null },
            })
          : weekRow
        : await tx.week.create({
            data: { tenantId: admin.tenantId, year, weekNumber, status: "DRAFT" },
          });

      if (week.status === "CLOSED") {
        // Defense in depth: a week could have been closed between the
        // pre-flight check above and the transaction. Aborting rolls back
        // any plan entries we already wrote in this loop instead of silently
        // skipping the day (which would still flip the request to APPROVED).
        throw new Error("CLOSED_WEEK_RACE");
      }

      const existing = await tx.planEntry.findFirst({
        where: {
          weekId: week.id,
          employeeId: request.employeeId,
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
        if (replacedEntrySamples.length < 20) {
          replacedEntrySamples.push({
            date: isoDateString(existing.date),
            previousKind: existing.kind,
            previousAbsenceType: existing.absenceType ?? null,
          });
        }
        await tx.planEntry.update({
          where: { id: existing.id },
          data: softDeleteFields(admin.id),
        });
      }
      await tx.planEntry.create({
        data: {
          weekId: week.id,
          employeeId: request.employeeId,
          date: day,
          kind: "ABSENCE",
          absenceType,
          plannedMinutes: 0,
          comment: request.comment,
        },
      });
    }

    await tx.absenceRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        decidedById: admin.id,
        decisionComment: parsedComment.text,
      },
    });
  });

  await writeAudit({
    userId: admin.id,
    action: "APPROVE",
    entity: "AbsenceRequest",
    entityId: requestId,
    oldValue: {
      status: request.status,
      decisionComment: request.decisionComment ?? null,
    },
    newValue: {
      status: "APPROVED",
      absenceType,
      from: isoDateString(request.startDate),
      to: isoDateString(request.endDate),
      replacedPlanEntries: replacedEntryCount,
      replacedPlanEntrySamples: replacedEntrySamples,
      weeksTouched,
      decisionComment: parsedComment.text,
    },
  });

  safeRevalidatePath("approveRequestAction", "/planning");
  safeRevalidatePath("approveRequestAction", "/absences");
  safeRevalidatePath("approveRequestAction", "/my-requests");
  return { ok: true };
}

export async function rejectRequestAction(
  requestId: string,
  reason?: string | null,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsedReason = parseDecisionComment(reason);
  if (!parsedReason.ok) {
    return { ok: false, error: parsedReason.error };
  }

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.tenantId !== admin.tenantId) {
    return { ok: false, error: "Antrag nicht gefunden." };
  }
  if (request.deletedAt) {
    return { ok: false, error: "Antrag nicht gefunden." };
  }
  if (request.status !== "OPEN") {
    return { ok: false, error: "Antrag wurde bereits bearbeitet." };
  }

  // Rejecting is intentionally not gated by CLOSED weeks (an admin must
  // always be able to reject an open request), but we record which weeks the
  // request range touched so the audit trail shows whether the rejection
  // covered closed weeks.
  const weeksTouched = await resolveWeeksTouched(
    admin.tenantId,
    isoWeeksInRange(request.startDate, request.endDate),
  );
  const touchedClosedWeek = weeksTouched.some((w) => w.status === "CLOSED");

  await prisma.absenceRequest.update({
    where: { id: requestId },
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
    entity: "AbsenceRequest",
    entityId: requestId,
    oldValue: {
      status: request.status,
      decisionComment: request.decisionComment ?? null,
    },
    newValue: {
      status: "REJECTED",
      weeksTouched,
      touchedClosedWeek,
      decisionComment: parsedReason.text,
    },
  });

  safeRevalidatePath("rejectRequestAction", "/planning");
  safeRevalidatePath("rejectRequestAction", "/absences");
  safeRevalidatePath("rejectRequestAction", "/my-requests");
  return { ok: true };
}

const createRequestSchema = z
  .object({
    type: z.enum([
      "VACATION",
      "FREE_REQUESTED",
      "UEZ_BEZUG",
      "TZT",
      "FREE_DAY",
      "PARENTAL_CARE",
    ]),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Startdatum erforderlich"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enddatum erforderlich"),
    comment: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "Enddatum muss nach Startdatum liegen.",
    path: ["endDate"],
  });

export async function createAbsenceRequestAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const employee = await requireEmployee();

  const raw = {
    type: readOptionalString(formData.get("type")) ?? "",
    startDate: readOptionalString(formData.get("startDate")) ?? "",
    endDate: readOptionalString(formData.get("endDate")) ?? "",
    comment: readOptionalString(formData.get("comment")),
  };

  const parsed = createRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;

  const startDate = parseIsoDate(data.startDate);
  const endDate = parseIsoDate(data.endDate);
  if (!startDate || !endDate) {
    return { ok: false, error: "Datum ungültig." };
  }

  const employeeId = employee.employeeId!;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (endDate < today) {
    const weeksTouched = await resolveWeeksTouched(
      employee.tenantId,
      isoWeeksInRange(startDate, endDate),
    );
    if (
      weeksTouched.length > 0 &&
      weeksTouched.every((w) => w.status === "CLOSED")
    ) {
      return {
        ok: false,
        error: "Beantragter Zeitraum liegt komplett in abgeschlossenen Wochen.",
      };
    }
  }

  const employeeRow = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      tenantId: employee.tenantId,
      status: "AKTIV",
    },
    select: {
      weeklyTargetMinutes: true,
      vacationDaysPerYear: true,
      tztModel: true,
      standardWorkDays: true,
      locationId: true,
      tenant: { select: { defaultStandardWorkDays: true } },
    },
  });
  if (!employeeRow) {
    return { ok: false, error: "Mitarbeitende:r nicht gefunden." };
  }

  if (
    data.type === "TZT" &&
    employeeRow.tztModel === "TARGET_REDUCTION"
  ) {
    return {
      ok: false,
      error:
        "TZT-Bezug ist im Modell 'Sollzeit-Reduktion' nicht vorgesehen. Wenden Sie sich an den Admin.",
    };
  }

  const effectiveStd = effectiveStandardWorkDays(
    employeeRow.standardWorkDays,
    employeeRow.tenant.defaultStandardWorkDays,
  );

  const holidayRows = await prisma.holiday.findMany({
    where: {
      tenantId: employee.tenantId,
      locationId: employeeRow.locationId,
      date: { gte: startDate, lte: endDate },
    },
    select: { date: true },
  });
  const holidayIsosByYear = new Map<number, Set<string>>();
  for (const h of holidayRows) {
    const iso = format(h.date, "yyyy-MM-dd");
    const year = Number(iso.slice(0, 4));
    let set = holidayIsosByYear.get(year);
    if (!set) {
      set = new Set<string>();
      holidayIsosByYear.set(year, set);
    }
    set.add(iso);
  }

  const sollDaysByYear = requestedSollDaysByYear(
    startDate,
    endDate,
    effectiveStd,
    holidayIsosByYear,
  );
  const years = Array.from(sollDaysByYear.keys());

  const balances = await prisma.accountBalance.findMany({
    where: {
      tenantId: employee.tenantId,
      employeeId,
      year: { in: years.length > 0 ? years : [startDate.getFullYear()] },
      accountType: {
        in: ["ZEITSALDO", "FERIEN", "UEZ", "TZT", "PARENTAL_CARE"],
      },
    },
    select: { year: true, accountType: true, currentValue: true },
  });

  const balancesByYear: RequestEntitlementInput["balancesByYear"] = {};
  for (const row of balances) {
    const y = (balancesByYear[row.year] ??= {});
    y[row.accountType as RequestAccountType] = row.currentValue;
  }

  const entitlement = evaluateRequestEntitlement({
    type: data.type,
    startDate,
    endDate,
    weeklyTargetMinutes: employeeRow.weeklyTargetMinutes,
    standardWorkDays: effectiveStd,
    holidayIsosByYear,
    tztModel: employeeRow.tztModel,
    vacationDaysPerYear: employeeRow.vacationDaysPerYear,
    balancesByYear,
  });
  if (!entitlement.ok) {
    return { ok: false, error: entitlement.error ?? "Anspruch nicht ausreichend." };
  }

  const created = await prisma.absenceRequest.create({
    data: {
      tenantId: employee.tenantId,
      employeeId,
      type: data.type,
      startDate,
      endDate,
      status: "OPEN",
      comment: data.comment ?? null,
    },
  });

  await writeAudit({
    userId: employee.id,
    action: "CREATE",
    entity: "AbsenceRequest",
    entityId: created.id,
    newValue: {
      type: data.type,
      from: data.startDate,
      to: data.endDate,
      status: "OPEN",
    },
    comment: data.comment ?? null,
  });

  safeRevalidatePath("createAbsenceRequestAction", "/my-requests");
  safeRevalidatePath("createAbsenceRequestAction", "/my-week");
  safeRevalidatePath("createAbsenceRequestAction", "/absences");
  safeRevalidatePath("createAbsenceRequestAction", "/planning");
  safeRevalidatePath("createAbsenceRequestAction", "/dashboard");
  return { ok: true };
}

export async function withdrawRequestAction(
  requestId: string,
): Promise<ActionResult> {
  const employee = await requireEmployee();

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.tenantId !== employee.tenantId) {
    return { ok: false, error: "Antrag nicht gefunden." };
  }
  if (request.deletedAt) {
    return { ok: false, error: "Antrag nicht gefunden." };
  }
  if (request.employeeId !== employee.employeeId) {
    return { ok: false, error: "Kein Zugriff auf diesen Antrag." };
  }
  if (request.status !== "OPEN") {
    return {
      ok: false,
      error: "Nur offene Anträge können zurückgezogen werden.",
    };
  }

  const now = new Date();
  await prisma.absenceRequest.update({
    where: { id: requestId },
    data: {
      status: "WITHDRAWN",
      cancelledAt: now,
      cancelledById: employee.employeeId,
    },
  });

  await writeAudit({
    userId: employee.id,
    action: "WITHDRAW",
    entity: "AbsenceRequest",
    entityId: requestId,
    oldValue: {
      type: request.type,
      from: isoDateString(request.startDate),
      to: isoDateString(request.endDate),
      status: request.status,
    },
    newValue: {
      status: "WITHDRAWN",
      cancelledAt: now.toISOString(),
      cancelledById: employee.employeeId,
    },
  });

  safeRevalidatePath("withdrawRequestAction", "/my-requests");
  safeRevalidatePath("withdrawRequestAction", "/absences");
  safeRevalidatePath("withdrawRequestAction", "/planning");
  safeRevalidatePath("withdrawRequestAction", "/dashboard");
  return { ok: true };
}

export async function reopenRequestAction(
  requestId: string,
  comment?: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.tenantId !== admin.tenantId) {
    return { ok: false, error: "Antrag nicht gefunden." };
  }
  if (request.deletedAt) {
    return { ok: false, error: "Antrag nicht gefunden." };
  }
  if (request.status === "WITHDRAWN" || request.status === "CANCELLED") {
    return {
      ok: false,
      error: "Zurückgezogene oder stornierte Anträge können nicht wieder eröffnet werden.",
    };
  }

  await prisma.absenceRequest.update({
    where: { id: requestId },
    data: {
      status: "OPEN",
      decidedAt: null,
      decidedById: null,
      decisionComment: null,
      comment: comment ?? request.comment,
    },
  });

  await writeAudit({
    userId: admin.id,
    action: "REOPEN",
    entity: "AbsenceRequest",
    entityId: requestId,
    oldValue: {
      status: request.status,
      decisionComment: request.decisionComment ?? null,
    },
    newValue: { status: "OPEN", decisionComment: null },
  });

  safeRevalidatePath("reopenRequestAction", "/planning");
  safeRevalidatePath("reopenRequestAction", "/absences");
  safeRevalidatePath("reopenRequestAction", "/my-requests");
  return { ok: true };
}
