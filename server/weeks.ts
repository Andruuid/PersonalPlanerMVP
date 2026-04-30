"use server";

import { addDays } from "date-fns";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { computeWeeklyBalance, type PlanEntryByDate, type WeeklyComputation } from "@/lib/time/balance";
import { buildHolidayLookup } from "@/lib/time/holidays";
import type { AbsenceType } from "@/lib/time/priority";
import { effectiveStandardWorkDays } from "@/lib/time/soll";
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
  serviceBlockColorHex: string | null;
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

/** Serializable Pflicht-Verstöße pro Mitarbeitendem (Audit / Override). */
export interface PublishComplianceViolationRow {
  employeeId: string;
  displayName: string;
  dailyRestViolations: Array<{ date: string; gapMinutes: number }>;
  weeklyRestOk: boolean;
  weeklyRestLongestGapMinutes: number;
  consecutiveWorkDayViolations: string[];
  halfDayOffMissing: boolean;
}

function planEntryToBalanceRow(e: {
  date: Date;
  kind: string;
  absenceType: string | null;
  plannedMinutes: number;
  serviceTemplate: { startTime: string; endTime: string } | null;
  oneTimeStart: string | null;
  oneTimeEnd: string | null;
}): PlanEntryByDate {
  const shiftStartTime =
    e.kind === "SHIFT" && e.serviceTemplate
      ? e.serviceTemplate.startTime
      : e.kind === "ONE_TIME_SHIFT"
        ? e.oneTimeStart
        : null;
  const shiftEndTime =
    e.kind === "SHIFT" && e.serviceTemplate
      ? e.serviceTemplate.endTime
      : e.kind === "ONE_TIME_SHIFT"
        ? e.oneTimeEnd
        : null;
  return {
    date: isoDateString(e.date),
    kind: e.kind as PlanEntryByDate["kind"],
    absenceType: (e.absenceType as AbsenceType | null | undefined) ?? null,
    plannedMinutes: e.plannedMinutes,
    shiftStartTime,
    shiftEndTime,
  };
}

function weeklyComputationHasMandatoryViolation(
  c: WeeklyComputation,
): boolean {
  return (
    c.dailyRestViolations.length > 0 ||
    c.weeklyRestOk === false ||
    c.consecutiveWorkDayViolations.length > 0 ||
    c.halfDayOffMissing
  );
}

function describeMandatoryViolationsShort(
  firstName: string,
  lastName: string,
  c: WeeklyComputation,
): string | null {
  if (!weeklyComputationHasMandatoryViolation(c)) return null;
  const parts: string[] = [];
  if (c.dailyRestViolations.length > 0) {
    parts.push(
      `tägliche Ruhezeit (${c.dailyRestViolations.map((v) => v.date).join(", ")})`,
    );
  }
  if (!c.weeklyRestOk) {
    parts.push("wöchentliche Ruhezeit zu kurz");
  }
  if (c.consecutiveWorkDayViolations.length > 0) {
    parts.push(
      `>6 Arbeitstage in Folge (${c.consecutiveWorkDayViolations.join(", ")})`,
    );
  }
  if (c.halfDayOffMissing) {
    parts.push("freier Halbtag fehlt");
  }
  return `${firstName} ${lastName}: ${parts.join("; ")}`;
}

async function loadPublishMandatoryViolations(
  weekId: string,
  tenantId: string,
  year: number,
  weekNumber: number,
): Promise<{
  rows: PublishComplianceViolationRow[];
  detailText: string;
}> {
  const employees = await prisma.employee.findMany({
    where: { tenantId, isActive: true, deletedAt: null },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: {
      tenant: { select: { defaultStandardWorkDays: true } },
    },
  });

  const weekStart = startOfIsoWeek(year, weekNumber);

  const [planEntries, streakPrefetchPlanEntries] = await Promise.all([
    prisma.planEntry.findMany({
      where: {
        weekId,
        deletedAt: null,
        employee: { tenantId, deletedAt: null },
      },
      include: {
        serviceTemplate: {
          select: { startTime: true, endTime: true },
        },
      },
    }),
    prisma.planEntry.findMany({
      where: {
        deletedAt: null,
        date: {
          gte: addDays(weekStart, -14),
          lt: weekStart,
        },
        employee: { tenantId, deletedAt: null },
      },
      include: {
        serviceTemplate: {
          select: { startTime: true, endTime: true },
        },
      },
    }),
  ]);

  const streakPrefetchByEmp = new Map<string, PlanEntryByDate[]>();
  for (const e of streakPrefetchPlanEntries) {
    const row = planEntryToBalanceRow(e);
    const list = streakPrefetchByEmp.get(e.employeeId) ?? [];
    list.push(row);
    streakPrefetchByEmp.set(e.employeeId, list);
  }

  const entriesByEmployee = new Map<string, PlanEntryByDate[]>();
  for (const e of planEntries) {
    const row = planEntryToBalanceRow(e);
    const list = entriesByEmployee.get(e.employeeId) ?? [];
    list.push(row);
    entriesByEmployee.set(e.employeeId, list);
  }

  const locationIds = [...new Set(employees.map((e) => e.locationId))];
  const holidays =
    locationIds.length === 0
      ? []
      : await prisma.holiday.findMany({
          where: {
            tenantId,
            locationId: { in: locationIds },
            date: {
              gte: new Date(year - 1, 11, 1),
              lt: new Date(year + 1, 1, 1),
            },
          },
        });

  const holidaysByLocation = new Map<string, ReturnType<typeof buildHolidayLookup>>();
  for (const locId of locationIds) {
    holidaysByLocation.set(
      locId,
      buildHolidayLookup(
        holidays
          .filter((h) => h.locationId === locId)
          .map((h) => ({ date: h.date, name: h.name })),
      ),
    );
  }

  const rows: PublishComplianceViolationRow[] = [];
  const detailLines: string[] = [];

  for (const emp of employees) {
    const balance = computeWeeklyBalance(
      year,
      weekNumber,
      entriesByEmployee.get(emp.id) ?? [],
      holidaysByLocation.get(emp.locationId) ?? buildHolidayLookup([]),
      {
        weeklyTargetMinutes: emp.weeklyTargetMinutes,
        hazMinutesPerWeek: emp.hazMinutesPerWeek,
        tztModel: emp.tztModel,
        standardWorkDays: effectiveStandardWorkDays(
          emp.standardWorkDays,
          emp.tenant.defaultStandardWorkDays,
        ),
      },
      streakPrefetchByEmp.get(emp.id) ?? [],
    );

    if (!weeklyComputationHasMandatoryViolation(balance)) continue;

    rows.push({
      employeeId: emp.id,
      displayName: `${emp.firstName} ${emp.lastName}`.trim(),
      dailyRestViolations: balance.dailyRestViolations,
      weeklyRestOk: balance.weeklyRestOk,
      weeklyRestLongestGapMinutes: balance.weeklyRestLongestGapMinutes,
      consecutiveWorkDayViolations: balance.consecutiveWorkDayViolations,
      halfDayOffMissing: balance.halfDayOffMissing,
    });

    const line = describeMandatoryViolationsShort(
      emp.firstName,
      emp.lastName,
      balance,
    );
    if (line) detailLines.push(line);
  }

  return {
    rows,
    detailText: detailLines.join(" · "),
  };
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
            blockColorHex: true,
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

  const snapshotEmployees = employees.map(({ locationId, ...rest }) => {
    void locationId;
    return rest;
  });

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
    serviceBlockColorHex: e.serviceTemplate?.blockColorHex ?? null,
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
  overrideReason?: string | null,
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

  const trimmedOverride = overrideReason?.trim() ?? "";
  const { rows: violationRows, detailText } = await loadPublishMandatoryViolations(
    weekId,
    admin.tenantId,
    week.year,
    week.weekNumber,
  );
  const hasMandatoryViolations = violationRows.length > 0;

  if (hasMandatoryViolations && trimmedOverride.length < 10) {
    return {
      ok: false,
      error: `Diese Woche enthält Pflicht-Verstöße: ${detailText}. Bitte beheben oder mit Begründung publizieren.`,
      fieldErrors: {
        override: "Begründung erforderlich (mind. 10 Zeichen)",
      },
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

  if (hasMandatoryViolations) {
    await writeAudit({
      userId: admin.id,
      action: "PUBLISH_WITH_OVERRIDE",
      entity: "Week",
      entityId: weekId,
      oldValue: { status: week.status },
      newValue: {
        status: "PUBLISHED",
        publishedAt: publishedAt.toISOString(),
        violations: violationRows,
      },
      comment: trimmedOverride,
    });
  } else {
    await writeAudit({
      userId: admin.id,
      action: "PUBLISH",
      entity: "Week",
      entityId: weekId,
      oldValue: { status: week.status },
      newValue: { status: "PUBLISHED", publishedAt: publishedAt.toISOString() },
    });
  }

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
  if (week.status !== "PUBLISHED" && week.status !== "REOPENED") {
    return {
      ok: false,
      error: "Nur veröffentlichte oder wieder geöffnete Wochen können abgeschlossen werden.",
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
    action: week.status === "REOPENED" ? "RECLOSE" : "CLOSE",
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
      data: { status: "REOPENED", closedAt: null },
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
      status: "REOPENED",
      cascadeFollowWeeksRecalculated,
    },
  });

  safeRevalidatePath("reopenWeekAction", "/planning");
  safeRevalidatePath("reopenWeekAction", "/my-week");
  safeRevalidatePath("reopenWeekAction", "/accounts");
  safeRevalidatePath("reopenWeekAction", "/my-accounts");
  return { ok: true };
}
