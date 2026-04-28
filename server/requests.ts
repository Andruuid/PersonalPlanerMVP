"use server";

import { addDays, getISOWeek, getISOWeekYear } from "date-fns";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { isoDateString, parseIsoDate } from "@/lib/time/week";
import {
  evaluateRequestEntitlement,
  requestedWeekdaysByYear,
  type RequestEntitlementInput,
  type RequestAccountType,
} from "@/lib/requests/entitlement";
import {
  fieldErrorsFromZod,
  readOptionalString,
  requireAdmin,
  requireEmployee,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";
import { archiveUntil } from "@/lib/archive";

const REQUEST_TO_ABSENCE: Record<
  "VACATION" | "FREE_REQUESTED" | "TZT" | "FREE_DAY" | "PARENTAL_CARE",
  "VACATION" | "FREE_REQUESTED" | "TZT" | "UNPAID" | "PARENTAL_CARE"
> = {
  VACATION: "VACATION",
  FREE_REQUESTED: "FREE_REQUESTED",
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

export async function approveRequestAction(
  requestId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.tenantId !== admin.tenantId) {
    return { ok: false, error: "Antrag nicht gefunden." };
  }
  if (request.status !== "OPEN") {
    return { ok: false, error: "Antrag wurde bereits bearbeitet." };
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
              data: { deletedAt: null, archivedUntil: null },
            })
          : weekRow
        : await tx.week.create({
            data: { tenantId: admin.tenantId, year, weekNumber, status: "DRAFT" },
          });

      if (week.status === "CLOSED") {
        continue;
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
          data: { deletedAt: new Date(), archivedUntil: archiveUntil() },
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
      },
    });
  });

  await writeAudit({
    userId: admin.id,
    action: "APPROVE",
    entity: "AbsenceRequest",
    entityId: requestId,
    oldValue: { status: request.status },
    newValue: {
      status: "APPROVED",
      absenceType,
      from: isoDateString(request.startDate),
      to: isoDateString(request.endDate),
      replacedPlanEntries: replacedEntryCount,
      replacedPlanEntrySamples: replacedEntrySamples,
    },
  });

  safeRevalidatePath("approveRequestAction", "/planning");
  safeRevalidatePath("approveRequestAction", "/absences");
  safeRevalidatePath("approveRequestAction", "/my-requests");
  return { ok: true };
}

export async function rejectRequestAction(
  requestId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.tenantId !== admin.tenantId) {
    return { ok: false, error: "Antrag nicht gefunden." };
  }
  if (request.status !== "OPEN") {
    return { ok: false, error: "Antrag wurde bereits bearbeitet." };
  }

  await prisma.absenceRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      decidedAt: new Date(),
      decidedById: admin.id,
    },
  });

  await writeAudit({
    userId: admin.id,
    action: "REJECT",
    entity: "AbsenceRequest",
    entityId: requestId,
    oldValue: { status: request.status },
    newValue: { status: "REJECTED" },
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
  const years = Array.from(
    new Set(Array.from(requestedWeekdaysByYear(startDate, endDate).keys())),
  );
  const employeeRow = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId: employee.tenantId },
    select: {
      weeklyTargetMinutes: true,
      vacationDaysPerYear: true,
      tztModel: true,
    },
  });
  if (!employeeRow) {
    return { ok: false, error: "Mitarbeitende:r nicht gefunden." };
  }

  const balances = await prisma.accountBalance.findMany({
    where: {
      tenantId: employee.tenantId,
      employeeId,
      year: { in: years.length > 0 ? years : [startDate.getFullYear()] },
      accountType: {
        in: ["ZEITSALDO", "FERIEN", "TZT", "PARENTAL_CARE"],
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
  return { ok: true };
}

export async function cancelOwnRequestAction(
  requestId: string,
): Promise<ActionResult> {
  const employee = await requireEmployee();

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.tenantId !== employee.tenantId) {
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

  await prisma.absenceRequest.delete({ where: { id: requestId } });

  await writeAudit({
    userId: employee.id,
    action: "CANCEL",
    entity: "AbsenceRequest",
    entityId: requestId,
    oldValue: {
      type: request.type,
      from: isoDateString(request.startDate),
      to: isoDateString(request.endDate),
      status: request.status,
    },
  });

  safeRevalidatePath("cancelOwnRequestAction", "/my-requests");
  safeRevalidatePath("cancelOwnRequestAction", "/absences");
  safeRevalidatePath("cancelOwnRequestAction", "/planning");
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

  await prisma.absenceRequest.update({
    where: { id: requestId },
    data: {
      status: "OPEN",
      decidedAt: null,
      decidedById: null,
      comment: comment ?? request.comment,
    },
  });

  await writeAudit({
    userId: admin.id,
    action: "REOPEN",
    entity: "AbsenceRequest",
    entityId: requestId,
    oldValue: { status: request.status },
    newValue: { status: "OPEN" },
  });

  safeRevalidatePath("reopenRequestAction", "/planning");
  safeRevalidatePath("reopenRequestAction", "/absences");
  safeRevalidatePath("reopenRequestAction", "/my-requests");
  return { ok: true };
}
