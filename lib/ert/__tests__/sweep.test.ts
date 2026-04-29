import { addDays } from "date-fns";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import {
  seedDraftWeek,
  seedEmployee,
  seedHoliday,
  seedLocation,
  seedShiftEntry,
} from "@/lib/test/fixtures";
import { sweepErtCasesForEmployee } from "@/lib/ert/sweep";
import { currentIsoWeek, isoDateString, parseIsoDate } from "@/lib/time/week";

/** Muss zum Mandanten-Feld `Tenant.ertDueDays` passen (Default 28). */
const DEFAULT_ERT_DUE_DAYS = 28;

let db: TestDb;

function dateAtMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

beforeAll(async () => {
  db = makeTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.reset();
});

/**
 * Legt im ERT-Erfüllungsfenster (Tag nach Trigger bis einschließlich Fälligkeit)
 * pro Kalendertag eine Schicht an, sodass zwischen den Blöcken nirgends 35h
 * ununterbrochene Ruhe entstehen (sonst wäre die Erfüllbarkeit fälschlich gegeben).
 */
async function seedDailyShiftsInErtRestWindow(
  tenantId: string,
  employeeId: string,
  triggerIso: string,
  /** Bereits angelegte Entwurfs-Wochen (z. B. Feiertags-KW), damit kein Duplicate-INSERT entsteht. */
  existingWeeks?: Map<string, string>,
  /** Fensterbreite für Test-Ruhestörungen — gleich `Tenant.ertDueDays` zum Zeitpunkt des Sweeps. */
  ertDueDays: number = DEFAULT_ERT_DUE_DAYS,
): Promise<void> {
  const triggerDate = new Date(`${triggerIso}T00:00:00`);
  const dueAt = addDays(triggerDate, ertDueDays);
  const windowStart = addDays(dateAtMidnight(triggerDate), 1);
  const windowEnd = addDays(dateAtMidnight(dueAt), 1);

  const weekCache = new Map<string, string>(existingWeeks);
  for (let cur = windowStart; cur < windowEnd; cur = addDays(cur, 1)) {
    const iso = isoDateString(cur);
    const meta = currentIsoWeek(cur);
    const wkKey = `${meta.year}-${meta.weekNumber}`;
    let weekId = weekCache.get(wkKey);
    if (!weekId) {
      weekId = await seedDraftWeek(db.prisma, meta.year, meta.weekNumber, tenantId);
      weekCache.set(wkKey, weekId);
    }
    await seedShiftEntry(db.prisma, {
      weekId,
      employeeId,
      isoDate: iso,
      plannedMinutes: 240,
    });
  }
}

describe("sweepErtCasesForEmployee", () => {
  it("opens an ERT case after Feiertagsarbeit ≥5h ohne 35h Ruhezeit (within due window)", async () => {
    const holidayIso = "2026-03-30";
    const { year: y, weekNumber: w } = currentIsoWeek(
      parseIsoDate(holidayIso) ?? new Date(2026, 2, 30),
    );
    const locationId = await seedLocation(db.prisma);
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedHoliday(db.prisma, locationId, holidayIso);
    const weekId = await seedDraftWeek(db.prisma, y, w);
    const weekPrimers = new Map([[`${y}-${w}`, weekId]]);

    await db.prisma.planEntry.create({
      data: {
        weekId,
        employeeId: employee.id,
        date: parseIsoDate(holidayIso)!,
        kind: "ONE_TIME_SHIFT",
        plannedMinutes: 360,
        oneTimeStart: "08:00",
        oneTimeEnd: "15:00",
        oneTimeBreakMinutes: 60,
        oneTimeLabel: "Feiertag",
      },
    });

    await seedDailyShiftsInErtRestWindow(
      employee.tenantId,
      employee.id,
      holidayIso,
      weekPrimers,
    );

    await sweepErtCasesForEmployee(
      db.prisma,
      employee.tenantId,
      employee.id,
      new Date(2026, 3, 15),
    );

    const cases = await db.prisma.ertCase.findMany({ where: { employeeId: employee.id } });
    expect(cases).toHaveLength(1);
    expect(cases[0].status).toBe("OPEN");
    expect(cases[0].holidayWorkMinutes).toBe(360);
  });

  it("sets OVERDUE when dueAt liegt vor dem Bezugsdatum", async () => {
    const holidayIso = "2026-03-30";
    const { year: y, weekNumber: w } = currentIsoWeek(
      parseIsoDate(holidayIso) ?? new Date(2026, 2, 30),
    );
    const locationId = await seedLocation(db.prisma);
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedHoliday(db.prisma, locationId, holidayIso);
    const weekId = await seedDraftWeek(db.prisma, y, w);
    const weekPrimers = new Map([[`${y}-${w}`, weekId]]);

    await db.prisma.planEntry.create({
      data: {
        weekId,
        employeeId: employee.id,
        date: parseIsoDate(holidayIso)!,
        kind: "ONE_TIME_SHIFT",
        plannedMinutes: 360,
        oneTimeStart: "08:00",
        oneTimeEnd: "15:00",
        oneTimeBreakMinutes: 60,
        oneTimeLabel: "Feiertag",
      },
    });

    await seedDailyShiftsInErtRestWindow(
      employee.tenantId,
      employee.id,
      holidayIso,
      weekPrimers,
    );

    await sweepErtCasesForEmployee(
      db.prisma,
      employee.tenantId,
      employee.id,
      new Date(2026, 4, 30),
    );

    const cases = await db.prisma.ertCase.findMany({ where: { employeeId: employee.id } });
    expect(cases).toHaveLength(1);
    expect(cases[0].status).toBe("OVERDUE");
  });

  it("uses Tenant.ertDueDays for new ERT dueAt (non-default)", async () => {
    const holidayIso = "2026-03-30";
    const { year: y, weekNumber: w } = currentIsoWeek(
      parseIsoDate(holidayIso) ?? new Date(2026, 2, 30),
    );
    const locationId = await seedLocation(db.prisma);
    const employee = await seedEmployee(db.prisma, { locationId });
    await db.prisma.tenant.update({
      where: { id: employee.tenantId },
      data: { ertDueDays: 14 },
    });
    await seedHoliday(db.prisma, locationId, holidayIso);
    const weekId = await seedDraftWeek(db.prisma, y, w);
    const weekPrimers = new Map([[`${y}-${w}`, weekId]]);

    await db.prisma.planEntry.create({
      data: {
        weekId,
        employeeId: employee.id,
        date: parseIsoDate(holidayIso)!,
        kind: "ONE_TIME_SHIFT",
        plannedMinutes: 360,
        oneTimeStart: "08:00",
        oneTimeEnd: "15:00",
        oneTimeBreakMinutes: 60,
        oneTimeLabel: "Feiertag",
      },
    });

    await seedDailyShiftsInErtRestWindow(
      employee.tenantId,
      employee.id,
      holidayIso,
      weekPrimers,
      14,
    );

    await sweepErtCasesForEmployee(
      db.prisma,
      employee.tenantId,
      employee.id,
      new Date(2026, 3, 15),
    );

    const cases = await db.prisma.ertCase.findMany({ where: { employeeId: employee.id } });
    expect(cases).toHaveLength(1);
    const triggerDate = parseIsoDate(holidayIso)!;
    expect(cases[0].dueAt.getTime()).toBe(addDays(triggerDate, 14).getTime());
  });
});
