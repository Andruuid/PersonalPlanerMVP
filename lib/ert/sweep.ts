/* eslint-disable tenant/require-tenant-scope --
 * Cron helper: invoked per-tenant; queries chain off cuid-globally-unique
 * employeeId. Defense-in-depth deferred.
 */
import { addDays } from "date-fns";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { upsertAndAdvanceErtCases } from "@/lib/bookings/core";
import { buildHolidayLookup } from "@/lib/time/holidays";
import type { AbsenceType, PlanEntryInput } from "@/lib/time/priority";
import { resolveDayFromEntries } from "@/lib/time/priority";
import { isoDateString, parseIsoDate } from "@/lib/time/week";

export const ERT_SWEEP_DAY_WINDOW = 90;

function dateAtMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isWeekendIso(iso: string): boolean {
  const date = new Date(`${iso}T00:00:00Z`);
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

function isEmployeeActiveOnDate(
  employee: { entryDate: Date; exitDate: Date | null },
  referenceDate: Date,
): boolean {
  if (employee.entryDate > referenceDate) return false;
  if (employee.exitDate && employee.exitDate < referenceDate) return false;
  return true;
}

function toPlanEntryInputs(
  rows: Array<{
    kind: string;
    absenceType: string | null;
    plannedMinutes: number;
  }>,
): PlanEntryInput[] {
  return rows.map((r) => ({
    kind: r.kind as PlanEntryInput["kind"],
    absenceType: r.absenceType as AbsenceType | null,
    plannedMinutes: r.plannedMinutes,
  }));
}

async function buildSweepDayRows(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  locationId: string,
  rangeStart: Date,
  rangeEndInclusive: Date,
): Promise<Array<{ iso: string; kind: string; plannedMinutes: number }>> {
  const wideFrom = new Date(rangeStart.getFullYear() - 1, 11, 1);
  const wideTo = new Date(rangeEndInclusive.getFullYear() + 1, 0, 1);
  const holidayRows = await prisma.holiday.findMany({
    where: {
      tenantId,
      locationId,
      date: { gte: wideFrom, lt: wideTo },
    },
    select: { date: true, name: true },
  });
  const holidays = buildHolidayLookup(
    holidayRows.map((h) => ({ date: h.date, name: h.name })),
  );

  const entries = await prisma.planEntry.findMany({
    where: {
      employeeId,
      deletedAt: null,
      date: { gte: rangeStart, lte: rangeEndInclusive },
    },
    select: {
      date: true,
      kind: true,
      absenceType: true,
      plannedMinutes: true,
    },
  });
  const byIso = new Map<string, typeof entries>();
  for (const e of entries) {
    const iso = isoDateString(e.date);
    const list = byIso.get(iso) ?? [];
    list.push(e);
    byIso.set(iso, list);
  }

  const out: Array<{ iso: string; kind: string; plannedMinutes: number }> = [];
  let cur = dateAtMidnight(rangeStart);
  const end = dateAtMidnight(rangeEndInclusive);
  while (cur <= end) {
    const iso = isoDateString(cur);
    const dayRows = byIso.get(iso) ?? [];
    const resolved = resolveDayFromEntries(
      toPlanEntryInputs(dayRows),
      holidays.has(iso),
      isWeekendIso(iso),
    );
    out.push({
      iso,
      kind: resolved.kind,
      plannedMinutes: resolved.plannedMinutes,
    });
    cur = addDays(cur, 1);
  }
  return out;
}

/**
 * ERT-Fortschreibung für eine:n Mitarbeitende:n: Fenster der letzten
 * {@link ERT_SWEEP_DAY_WINDOW} Kalendertage aus PlanEntry (aufgelöste Tagesart),
 * dann {@link upsertAndAdvanceErtCases}.
 */
export async function sweepErtCasesForEmployee(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  asOf: Date = new Date(),
): Promise<void> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId, deletedAt: null },
    select: {
      id: true,
      locationId: true,
      entryDate: true,
      exitDate: true,
    },
  });
  if (!employee) return;
  if (!isEmployeeActiveOnDate(employee, asOf)) return;

  const asOfDay = dateAtMidnight(asOf);
  const rangeStart = addDays(asOfDay, -(ERT_SWEEP_DAY_WINDOW - 1));
  const dayRows = await buildSweepDayRows(
    prisma,
    tenantId,
    employeeId,
    employee.locationId,
    rangeStart,
    asOfDay,
  );

  await prisma.$transaction((tx) =>
    upsertAndAdvanceErtCases(tx, employee.id, tenantId, dayRows, asOf),
  );
}

/**
 * Alle aktiven Mitarbeitenden eines Mandanten durchlaufen (siehe
 * {@link sweepErtCasesForEmployee}).
 */
export async function sweepErtCases(
  prisma: PrismaClient,
  tenantId: string,
  asOf: Date = new Date(),
): Promise<void> {
  const employees = await prisma.employee.findMany({
    where: { tenantId, status: "AKTIV" },
    select: { id: true, entryDate: true, exitDate: true },
  });
  for (const emp of employees) {
    if (!isEmployeeActiveOnDate(emp, asOf)) continue;
    await sweepErtCasesForEmployee(prisma, tenantId, emp.id, asOf);
  }
}

/**
 * Nach Planänderung: Sweep nur wenn relevant (Feiertagsarbeit &gt; 5h oder
 * offener ERT-Fall mit gleichem Kalendertag als Trigger).
 */
export async function shouldSweepErtAfterPlanWrite(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  isoDate: string,
): Promise<boolean> {
  const dayDate = parseIsoDate(isoDate);
  if (!dayDate) return false;

  const dayEnd = addDays(dateAtMidnight(dayDate), 1);
  const openOnTrigger = await prisma.ertCase.findFirst({
    where: {
      employeeId,
      tenantId,
      status: { in: ["OPEN", "OVERDUE"] },
      triggerDate: { gte: dateAtMidnight(dayDate), lt: dayEnd },
    },
    select: { id: true },
  });
  if (openOnTrigger) return true;

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId, deletedAt: null },
    select: { locationId: true },
  });
  if (!employee) return false;

  const holidayRows = await prisma.holiday.findMany({
    where: { tenantId, locationId: employee.locationId },
    select: { date: true, name: true },
  });
  const holidays = buildHolidayLookup(
    holidayRows.map((h) => ({ date: h.date, name: h.name })),
  );

  const rows = await prisma.planEntry.findMany({
    where: {
      employeeId,
      deletedAt: null,
      date: { gte: dateAtMidnight(dayDate), lt: dayEnd },
    },
    select: {
      kind: true,
      absenceType: true,
      plannedMinutes: true,
    },
  });
  const resolved = resolveDayFromEntries(
    toPlanEntryInputs(rows),
    holidays.has(isoDate),
    isWeekendIso(isoDate),
  );
  return resolved.kind === "HOLIDAY_WORK" && resolved.plannedMinutes > 300;
}

export async function maybeSweepErtAfterPlanWrite(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  isoDate: string,
): Promise<void> {
  const should = await shouldSweepErtAfterPlanWrite(
    prisma,
    tenantId,
    employeeId,
    isoDate,
  );
  if (!should) return;
  await sweepErtCasesForEmployee(prisma, tenantId, employeeId);
}
