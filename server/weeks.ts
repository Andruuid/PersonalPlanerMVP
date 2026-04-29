"use server";

import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { isoDateString, isoWeekDays, startOfIsoWeek } from "@/lib/time/week";
import {
  actionErrorFromDatabase,
  requireAdmin,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";
import {
  recalcWeekCloseForAdmin,
  removeWeekClosingBookingsForAdmin,
} from "./week-booking-helpers";

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

/** Ein Feiertag im Mo–So-Fenster der ISO-Woche, zum Publish-Zeitpunkt. */
export type WeekSnapshotHolidayRow = { iso: string; name: string };

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
  /**
   * Feiertage eingefroren pro Standort: Schlüssel = locationId der aktiven
   * Mitarbeitenden zum Publish-Zeitpunkt, Werte = Feiertage in diesem Standort
   * im Mo–So-Range der Woche (gleiche Semantik wie früher live aus prisma.holiday).
   * Fehlt bei älteren Snapshots → loadMyWeek nutzt prisma.holiday (DRAFT/Altbestand).
   */
  holidays?: Record<string, WeekSnapshotHolidayRow[]>;
}

export async function buildWeekSnapshot(
  weekId: string,
  tenantId: string,
): Promise<WeekSnapshot> {
  const week = await prisma.week.findFirst({
    where: { id: weekId, tenantId, deletedAt: null },
  });
  if (!week) throw new Error("Week not found");

  const [employees, entries] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId, isActive: true, deletedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        roleLabel: true,
        locationId: true,
      },
    }),
    prisma.planEntry.findMany({
      where: { weekId, deletedAt: null, employee: { tenantId } },
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

  const weekDayModels = isoWeekDays(week.year, week.weekNumber);
  const days = weekDayModels.map((d) => d.iso);
  const rangeStart = startOfIsoWeek(week.year, week.weekNumber);
  const rangeEnd = weekDayModels[6]!.date;

  const locationIds = [
    ...new Set(employees.map((e) => e.locationId)),
  ];
  const holidays: Record<string, WeekSnapshotHolidayRow[]> = Object.fromEntries(
    locationIds.map((id) => [id, [] as WeekSnapshotHolidayRow[]]),
  );
  if (locationIds.length > 0) {
    const holidayRows = await prisma.holiday.findMany({
      where: {
        tenantId,
        locationId: { in: locationIds },
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { locationId: true, date: true, name: true },
    });
    for (const h of holidayRows) {
      const list = holidays[h.locationId];
      if (list) {
        list.push({ iso: isoDateString(h.date), name: h.name });
      }
    }
    for (const id of locationIds) {
      holidays[id]!.sort((a, b) => a.iso.localeCompare(b.iso));
    }
  }

  const snapshotEmployees = employees.map(
    ({ locationId: _loc, ...rest }) => rest,
  );

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
    employees: snapshotEmployees,
    entries: snapshotEntries,
    holidays,
  };
}

export async function publishWeekAction(
  weekId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week || week.deletedAt) return { ok: false, error: "Woche nicht gefunden." };
  if (week.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diese Woche." };
  }
  if (week.status === "CLOSED") {
    return {
      ok: false,
      error: "Abgeschlossene Wochen können nicht veröffentlicht werden.",
    };
  }

  const snapshot = await buildWeekSnapshot(weekId, admin.tenantId);
  const publishedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.publishedSnapshot.create({
      data: {
        tenantId: admin.tenantId,
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

  safeRevalidatePath("publishWeekAction", "/planning");
  safeRevalidatePath("publishWeekAction", "/my-week");
  return { ok: true };
}

export async function resetWeekToDraftAction(
  weekId: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week || week.deletedAt) return { ok: false, error: "Woche nicht gefunden." };
  if (week.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diese Woche." };
  }
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

  safeRevalidatePath("resetWeekToDraftAction", "/planning");
  return { ok: true };
}

export async function closeWeekAction(weekId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week || week.deletedAt) return { ok: false, error: "Woche nicht gefunden." };
  if (week.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diese Woche." };
  }
  if (week.status !== "PUBLISHED") {
    return {
      ok: false,
      error: "Nur veröffentlichte Wochen können abgeschlossen werden.",
    };
  }

  try {
    await recalcWeekCloseForAdmin(weekId, admin.id);
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

  safeRevalidatePath("closeWeekAction", "/planning");
  safeRevalidatePath("closeWeekAction", "/my-week");
  safeRevalidatePath("closeWeekAction", "/accounts");
  safeRevalidatePath("closeWeekAction", "/my-accounts");
  return { ok: true };
}

export async function reopenWeekAction(
  weekId: string,
  cascadeRecalc = true,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const week = await prisma.week.findUnique({ where: { id: weekId } });
  if (!week || week.deletedAt) return { ok: false, error: "Woche nicht gefunden." };
  if (week.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diese Woche." };
  }
  if (week.status !== "CLOSED") {
    return {
      ok: false,
      error: "Nur abgeschlossene Wochen können wieder geöffnet werden.",
    };
  }

  try {
    await removeWeekClosingBookingsForAdmin(weekId, admin.id);
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

  let cascadeFollowWeeksRecalculated = 0;
  if (cascadeRecalc) {
    const followClosedWeeks = await prisma.week.findMany({
      where: {
        tenantId: week.tenantId,
        status: "CLOSED",
        deletedAt: null,
        OR: [
          { year: { gt: week.year } },
          { AND: [{ year: week.year }, { weekNumber: { gt: week.weekNumber } }] },
        ],
      },
      orderBy: [{ year: "asc" }, { weekNumber: "asc" }],
      select: { id: true },
    });

    for (const w of followClosedWeeks) {
      try {
        await recalcWeekCloseForAdmin(w.id, admin.id);
        cascadeFollowWeeksRecalculated += 1;
      } catch (err) {
        return { ok: false, error: actionErrorFromDatabase(err) };
      }
    }
  }

  await writeAudit({
    userId: admin.id,
    action: "REOPEN",
    entity: "Week",
    entityId: weekId,
    oldValue: { status: week.status },
    newValue: {
      status: "DRAFT",
      cascadeFollowWeeksRecalculated,
    },
  });

  safeRevalidatePath("reopenWeekAction", "/planning");
  safeRevalidatePath("reopenWeekAction", "/my-week");
  safeRevalidatePath("reopenWeekAction", "/accounts");
  safeRevalidatePath("reopenWeekAction", "/my-accounts");
  return { ok: true };
}
