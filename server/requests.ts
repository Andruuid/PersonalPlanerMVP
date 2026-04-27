"use server";

import { addDays, getISOWeek, getISOWeekYear } from "date-fns";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { isoDateString } from "@/lib/time/week";
import { requireAdmin, type ActionResult } from "./_shared";

const REQUEST_TO_ABSENCE: Record<
  "VACATION" | "FREE_REQUESTED" | "TZT" | "FREE_DAY",
  "VACATION" | "FREE_REQUESTED" | "TZT" | "UNPAID"
> = {
  VACATION: "VACATION",
  FREE_REQUESTED: "FREE_REQUESTED",
  TZT: "TZT",
  FREE_DAY: "UNPAID",
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
  if (!request) return { ok: false, error: "Antrag nicht gefunden." };
  if (request.status !== "OPEN") {
    return { ok: false, error: "Antrag wurde bereits bearbeitet." };
  }

  const absenceType = REQUEST_TO_ABSENCE[request.type];

  await prisma.$transaction(async (tx) => {
    for (const day of daysInRange(request.startDate, request.endDate)) {
      const year = getISOWeekYear(day);
      const weekNumber = getISOWeek(day);
      const weekRow = await tx.week.findUnique({
        where: { year_weekNumber: { year, weekNumber } },
      });
      const week =
        weekRow ??
        (await tx.week.create({
          data: { year, weekNumber, status: "DRAFT" },
        }));

      if (week.status === "CLOSED") {
        continue;
      }

      const existing = await tx.planEntry.findFirst({
        where: {
          weekId: week.id,
          employeeId: request.employeeId,
          date: day,
        },
      });
      if (existing) {
        await tx.planEntry.delete({ where: { id: existing.id } });
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
    },
  });

  revalidatePath("/planning");
  revalidatePath("/absences");
  revalidatePath("/my-requests");
  return { ok: true };
}

export async function rejectRequestAction(
  requestId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const request = await prisma.absenceRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { ok: false, error: "Antrag nicht gefunden." };
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

  revalidatePath("/planning");
  revalidatePath("/absences");
  revalidatePath("/my-requests");
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
  if (!request) return { ok: false, error: "Antrag nicht gefunden." };

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

  revalidatePath("/planning");
  revalidatePath("/absences");
  revalidatePath("/my-requests");
  return { ok: true };
}
