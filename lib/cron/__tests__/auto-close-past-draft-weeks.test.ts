import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { autoFinalizePastDraftWeeksForAllTenants } from "@/lib/cron/auto-close-past-weeks";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import {
  seedAdmin,
  seedDraftWeek,
  seedEmployee,
  seedLocation,
  seedShiftEntry,
} from "@/lib/test/fixtures";
import { getISOWeek, getISOWeekYear } from "date-fns";
import { isoWeekDays } from "@/lib/time/week";

/** Fixierter „heute“ für deterministische ISO-Woche / Vergangenheit. */
const AS_OF = new Date(2026, 3, 30);

/** Vergangene Woche relativ zu AS_OF (Sonntag strikt vor dem Kalendertag). */
const PAST_YEAR = 2026;
const PAST_WEEK = 10;

let db: TestDb;

beforeAll(async () => {
  db = makeTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.reset();
  await seedAdmin(db.prisma, `adm-default-${randomUUID()}@test.local`, "default");
});

describe("autoFinalizePastDraftWeeksForAllTenants", () => {
  it("skips empty past DRAFT weeks, writes AUTO_CLOSE_SKIPPED_EMPTY, leaves week DRAFT", async () => {
    await seedAdmin(db.prisma);
    const weekId = await seedDraftWeek(db.prisma, PAST_YEAR, PAST_WEEK);

    const beforeBalances = await db.prisma.accountBalance.findMany();

    const result = await autoFinalizePastDraftWeeksForAllTenants(db.prisma, AS_OF);

    expect(result.weeksSkippedEmpty).toBe(1);
    expect(result.weeksClosedFromDraft).toBe(0);
    expect(result.errors).toEqual([]);

    const week = await db.prisma.week.findUniqueOrThrow({ where: { id: weekId } });
    expect(week.status).toBe("DRAFT");
    expect(week.closedAt).toBeNull();

    const afterBalances = await db.prisma.accountBalance.findMany();
    expect(afterBalances).toEqual(beforeBalances);

    const audit = await db.prisma.auditLog.findFirst({
      where: { action: "AUTO_CLOSE_SKIPPED_EMPTY", entityId: weekId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.entity).toBe("Week");
  });

  it("closes past DRAFT with plan entries via recalc, writes AUTO_CLOSE_FROM_DRAFT", async () => {
    const admin = await seedAdmin(db.prisma);
    const locationId = await seedLocation(db.prisma);
    const weekId = await seedDraftWeek(db.prisma, PAST_YEAR, PAST_WEEK);
    const days = isoWeekDays(PAST_YEAR, PAST_WEEK).map((d) => d.iso);
    const employee = await seedEmployee(db.prisma, { locationId });
    for (let i = 0; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: days[i]!,
        plannedMinutes: 540,
      });
    }

    const result = await autoFinalizePastDraftWeeksForAllTenants(db.prisma, AS_OF);

    expect(result.weeksClosedFromDraft).toBe(1);
    expect(result.weeksSkippedEmpty).toBe(0);
    expect(result.errors).toEqual([]);

    const week = await db.prisma.week.findUniqueOrThrow({ where: { id: weekId } });
    expect(week.status).toBe("CLOSED");
    expect(week.closedAt).not.toBeNull();

    const audit = await db.prisma.auditLog.findFirst({
      where: { action: "AUTO_CLOSE_FROM_DRAFT", entityId: weekId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.comment).toBe(
      "Vergangene DRAFT-Woche automatisch abgeschlossen — keine Veröffentlichung erfolgt",
    );

    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(bookings.length).toBeGreaterThan(0);
  });

  it("processes multiple tenants independently (empty skip vs filled close)", async () => {
    const adminA = await seedAdmin(db.prisma);
    const tenantA = (
      await db.prisma.user.findUniqueOrThrow({
        where: { id: adminA.id },
        select: { tenantId: true },
      })
    ).tenantId;

    const slugB = `tenant-b-${randomUUID()}`;
    const tenantB = await db.prisma.tenant.create({
      data: { name: "Tenant B", slug: slugB },
    });
    await seedAdmin(db.prisma, `adm-b-${randomUUID()}@test.local`, tenantB.id);
    await seedLocation(db.prisma, "Loc B", "ZH", tenantB.id);

    const emptyWeekId = await seedDraftWeek(db.prisma, PAST_YEAR, PAST_WEEK, tenantA);
    const filledWeekId = await seedDraftWeek(db.prisma, PAST_YEAR, PAST_WEEK, tenantB.id);

    const days = isoWeekDays(PAST_YEAR, PAST_WEEK).map((d) => d.iso);
    const employeeB = await seedEmployee(db.prisma, { tenantId: tenantB.id });
    await seedShiftEntry(db.prisma, {
      weekId: filledWeekId,
      employeeId: employeeB.id,
      isoDate: days[0]!,
      plannedMinutes: 480,
    });

    const result = await autoFinalizePastDraftWeeksForAllTenants(db.prisma, AS_OF);

    expect(result.weeksSkippedEmpty).toBe(1);
    expect(result.weeksClosedFromDraft).toBe(1);
    expect(result.errors).toEqual([]);

    const emptyWeek = await db.prisma.week.findUniqueOrThrow({
      where: { id: emptyWeekId },
    });
    expect(emptyWeek.status).toBe("DRAFT");

    const filledWeek = await db.prisma.week.findUniqueOrThrow({
      where: { id: filledWeekId },
    });
    expect(filledWeek.status).toBe("CLOSED");
  });

  it("does not close current ISO week DRAFT (Sunday not before asOf)", async () => {
    const admin = await seedAdmin(db.prisma);
    const locationId = await seedLocation(db.prisma);
    const y = getISOWeekYear(AS_OF);
    const w = getISOWeek(AS_OF);
    const weekId = await seedDraftWeek(db.prisma, y, w);
    const days = isoWeekDays(y, w).map((d) => d.iso);
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedShiftEntry(db.prisma, {
      weekId,
      employeeId: employee.id,
      isoDate: days[0]!,
      plannedMinutes: 480,
    });

    const result = await autoFinalizePastDraftWeeksForAllTenants(db.prisma, AS_OF);

    expect(result.weeksClosedFromDraft).toBe(0);
    expect(result.weeksSkippedEmpty).toBe(0);

    const week = await db.prisma.week.findUniqueOrThrow({ where: { id: weekId } });
    expect(week.status).toBe("DRAFT");
  });
});
