"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { isoDateString, isoWeekDays } from "@/lib/time/week";
import {
  actionErrorFromDatabase,
  requireAdmin,
  type ActionResult,
} from "./_shared";
import { recalcWeekClose, removeWeekClosingBookings } from "./bookings";

export interface WeekIdentity {
  id: string;
  year: number;
  weekNumber: number;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
  publishedAt: Date | null;
  closedAt: Date | null;
}

/**
 * Returns the Week row for (year, weekNumber), creating it as DRAFT if missing.
 * Read-only callers (page loads) can use this safely; it does not require admin.
 */
export async function getOrCreateWeek(
  year: number,
  weekNumber: number,
): Promise<WeekIdentity> {
  const existing = await prisma.week.findUnique({
    where: { year_weekNumber: { year, weekNumber } },
  });
  if (existing) return existing as WeekIdentity;

  const created = await prisma.week.create({
    data: { year, weekNumber, status: "DRAFT" },
  });
  return created as WeekIdentity;
}

interface SnapshotEntry {
  id: string;
  date: string;
  employeeId: string;
  kind: string;
  serviceTemplateId: string | null;
  serviceCode: string | null;
  serviceName: string | null;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
  oneTimeBreakMinutes: number | null;
  oneTimeLabel: string | null;
  absenceType: string | null;
  plannedMinutes: number;
  comment: string | null;
}

export interface WeekSnapshot {
  year: number;
  weekNumber: number;
  publishedAt: string;
  days: string[];
  employees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    roleLabel: string | null;
  }>;
  entries: SnapshotEntry[];
}

async function buildSnapshot(weekId: string): Promise<WeekSnapshot> {
  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) throw new Error("Week not found");

  const [employees, entries] = await Promise.all([
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        roleLabel: true,
      },
    }),
    prisma.planEntry.findMany({
      where: { weekId },
      include: {
        serviceTemplate: {
          select: {
            code: true,
            name: true,
            startTime: true,
            endTime: true,
            breakMinutes: true,
          },
        },
      },
    }),
  ]);

  const days = isoWeekDays(week.year, week.weekNumber).map((d) => d.iso);

  const snapshotEntries: SnapshotEntry[] = entries.map((e) => ({
    id: e.id,
    date: isoDateString(e.date),
    employeeId: e.employeeId,
    kind: e.kind,
    serviceTemplateId: e.serviceTemplateId,
    serviceCode: e.serviceTemplate?.code ?? null,
    serviceName: e.serviceTemplate?.name ?? null,
    startTime: e.serviceTemplate?.startTime ?? null,
    endTime: e.serviceTemplate?.endTime ?? null,
    breakMinutes: e.serviceTemplate?.breakMinutes ?? null,
    oneTimeStart: e.oneTimeStart,
    oneTimeEnd: e.oneTimeEnd,
    oneTimeBreakMinutes: e.oneTimeBreakMinutes,
    oneTimeLabel: e.oneTimeLabel,
    absenceType: e.absenceType,
    plannedMinutes: e.plannedMinutes,
    comment: e.comment,
  }));

  return {
    year: week.year,
    weekNumber: week.weekNumber,
    publishedAt: new Date().toISOString(),
    days,
    employees,
    entries: snapshotEntries,
  };
}

export async function publishWeekAction(
  weekId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) return { ok: false, error: "Woche nicht gefunden." };
  if (week.status === "CLOSED") {
    return {
      ok: false,
      error: "Abgeschlossene Wochen können nicht veröffentlicht werden.",
    };
  }

  const snapshot = await buildSnapshot(weekId);
  const publishedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.publishedSnapshot.create({
      data: {
        weekId,
        snapshotJson: JSON.stringify(snapshot),
        publishedAt,
      },
    });
    await tx.week.update({
      where: { id: weekId },
      data: { status: "PUBLISHED", publishedAt },
    });
  });

  await writeAudit({
    userId: admin.id,
    action: "PUBLISH",
    entity: "Week",
    entityId: weekId,
    oldValue: { status: week.status },
    newValue: { status: "PUBLISHED", publishedAt: publishedAt.toISOString() },
  });

  revalidatePath("/planning");
  revalidatePath("/my-week");
  return { ok: true };
}

export async function resetWeekToDraftAction(
  weekId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) return { ok: false, error: "Woche nicht gefunden." };
  if (week.status !== "PUBLISHED") {
    return { ok: false, error: "Nur veröffentlichte Wochen können zurückgesetzt werden." };
  }

  await prisma.week.update({
    where: { id: weekId },
    data: { status: "DRAFT" },
  });

  await writeAudit({
    userId: admin.id,
    action: "RESET_TO_DRAFT",
    entity: "Week",
    entityId: weekId,
    oldValue: { status: week.status },
    newValue: { status: "DRAFT" },
  });

  revalidatePath("/planning");
  return { ok: true };
}

export async function closeWeekAction(weekId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) return { ok: false, error: "Woche nicht gefunden." };
  if (week.status !== "PUBLISHED") {
    return {
      ok: false,
      error: "Nur veröffentlichte Wochen können abgeschlossen werden.",
    };
  }

  try {
    await recalcWeekClose(weekId, admin.id);
  } catch (err) {
    return { ok: false, error: actionErrorFromDatabase(err) };
  }

  const closedAt = new Date();
  try {
    await prisma.week.update({
      where: { id: weekId },
      data: { status: "CLOSED", closedAt },
    });
  } catch (err) {
    return { ok: false, error: actionErrorFromDatabase(err) };
  }

  await writeAudit({
    userId: admin.id,
    action: "CLOSE",
    entity: "Week",
    entityId: weekId,
    oldValue: { status: week.status },
    newValue: { status: "CLOSED", closedAt: closedAt.toISOString() },
  });

  revalidatePath("/planning");
  revalidatePath("/my-week");
  revalidatePath("/accounts");
  revalidatePath("/my-accounts");
  return { ok: true };
}

export async function reopenWeekAction(weekId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week) return { ok: false, error: "Woche nicht gefunden." };
  if (week.status !== "CLOSED") {
    return {
      ok: false,
      error: "Nur abgeschlossene Wochen können wieder geöffnet werden.",
    };
  }

  try {
    await removeWeekClosingBookings(weekId, admin.id);
  } catch (err) {
    return { ok: false, error: actionErrorFromDatabase(err) };
  }

  try {
    await prisma.week.update({
      where: { id: weekId },
      data: { status: "DRAFT", closedAt: null },
    });
  } catch (err) {
    return { ok: false, error: actionErrorFromDatabase(err) };
  }

  await writeAudit({
    userId: admin.id,
    action: "REOPEN",
    entity: "Week",
    entityId: weekId,
    oldValue: { status: week.status },
    newValue: { status: "DRAFT" },
  });

  revalidatePath("/planning");
  revalidatePath("/my-week");
  revalidatePath("/accounts");
  revalidatePath("/my-accounts");
  return { ok: true };
}
