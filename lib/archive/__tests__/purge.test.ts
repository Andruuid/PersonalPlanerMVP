import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedAdmin, seedEmployee, seedLocation } from "@/lib/test/fixtures";
import { purgeArchivedData } from "../purge";

let db: TestDb;

beforeAll(async () => {
  db = makeTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.reset();
});

describe("purgeArchivedData", () => {
  it("supports dry-run without deleting records", async () => {
    const locationId = await seedLocation(db.prisma, "Archived Loc");
    const week = await db.prisma.week.create({
      data: {
        year: 2025,
        weekNumber: 8,
        status: "DRAFT",
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const employee = await seedEmployee(db.prisma, {
      locationId,
      isActive: false,
    });
    await db.prisma.employee.update({
      where: { id: employee.id },
      data: {
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await db.prisma.planEntry.create({
      data: {
        weekId: week.id,
        employeeId: employee.id,
        date: new Date("2025-02-17T00:00:00.000Z"),
        kind: "ABSENCE",
        absenceType: "VACATION",
        plannedMinutes: 0,
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await db.prisma.location.update({
      where: { id: locationId },
      data: {
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    const result = await purgeArchivedData(db.prisma, {
      dryRun: true,
      now: new Date("2037-01-01T00:00:00.000Z"),
    });

    expect(result.dryRun).toBe(true);
    expect(result.candidates).toEqual({
      planEntries: 1,
      weeks: 1,
      employees: 1,
      locations: 1,
    });
    expect(result.deleted).toEqual({
      planEntries: 0,
      weeks: 0,
      employees: 0,
      locations: 0,
    });

    expect(await db.prisma.planEntry.count()).toBe(1);
    expect(await db.prisma.week.count()).toBe(1);
    expect(await db.prisma.employee.count()).toBe(1);
    expect(await db.prisma.location.count()).toBe(1);
  });

  it("purges only expired archived records", async () => {
    const admin = await seedAdmin(db.prisma);
    const expiredLocation = await seedLocation(db.prisma, "Expired Loc");
    const keptLocation = await seedLocation(db.prisma, "Kept Loc");

    const expiredEmployee = await seedEmployee(db.prisma, {
      locationId: expiredLocation,
      isActive: false,
    });
    const keptEmployee = await seedEmployee(db.prisma, {
      locationId: keptLocation,
      isActive: false,
    });

    await db.prisma.employee.update({
      where: { id: expiredEmployee.id },
      data: {
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await db.prisma.employee.update({
      where: { id: keptEmployee.id },
      data: {
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2040-01-01T00:00:00.000Z"),
      },
    });

    const expiredWeek = await db.prisma.week.create({
      data: {
        year: 2025,
        weekNumber: 10,
        status: "DRAFT",
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const keptWeek = await db.prisma.week.create({
      data: {
        year: 2025,
        weekNumber: 11,
        status: "DRAFT",
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2040-01-01T00:00:00.000Z"),
      },
    });

    await db.prisma.planEntry.create({
      data: {
        weekId: expiredWeek.id,
        employeeId: expiredEmployee.id,
        date: new Date("2025-03-03T00:00:00.000Z"),
        kind: "ABSENCE",
        absenceType: "VACATION",
        plannedMinutes: 0,
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await db.prisma.planEntry.create({
      data: {
        weekId: keptWeek.id,
        employeeId: keptEmployee.id,
        date: new Date("2025-03-10T00:00:00.000Z"),
        kind: "ABSENCE",
        absenceType: "VACATION",
        plannedMinutes: 0,
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2040-01-01T00:00:00.000Z"),
      },
    });

    await db.prisma.location.update({
      where: { id: expiredLocation },
      data: {
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await db.prisma.location.update({
      where: { id: keptLocation },
      data: {
        deletedAt: new Date("2025-01-01T00:00:00.000Z"),
        archivedUntil: new Date("2040-01-01T00:00:00.000Z"),
      },
    });

    // Keep an audit row around so we know purge doesn't touch unrelated tables.
    await db.prisma.auditLog.create({
      data: {
        tenantId: "default",
        userId: admin.id,
        action: "TEST",
        entity: "Purge",
      },
    });

    const result = await purgeArchivedData(db.prisma, {
      now: new Date("2037-01-01T00:00:00.000Z"),
    });

    expect(result.deleted).toEqual({
      planEntries: 1,
      weeks: 1,
      employees: 1,
      locations: 1,
    });

    expect(await db.prisma.employee.findUnique({ where: { id: expiredEmployee.id } })).toBeNull();
    expect(await db.prisma.employee.findUnique({ where: { id: keptEmployee.id } })).not.toBeNull();
    expect(await db.prisma.week.findUnique({ where: { id: expiredWeek.id } })).toBeNull();
    expect(await db.prisma.week.findUnique({ where: { id: keptWeek.id } })).not.toBeNull();
    expect(await db.prisma.location.findUnique({ where: { id: expiredLocation } })).toBeNull();
    expect(await db.prisma.location.findUnique({ where: { id: keptLocation } })).not.toBeNull();
    expect(await db.prisma.auditLog.count()).toBe(1);
  });
});
