import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import {
  seedAdmin,
  seedDraftWeek,
  seedEmployee,
  seedLocation,
  seedShiftEntry,
} from "@/lib/test/fixtures";
import { recalcWeekClose } from "@/lib/bookings/core";
import { isoWeekDays } from "@/lib/time/week";

const requireAdminMock = vi.hoisted(() => vi.fn());
const safeRevalidatePathMock = vi.hoisted(() => vi.fn());
const writeAuditMock = vi.hoisted(() => vi.fn());
const dbRef = vi.hoisted(() => ({ prisma: null as PrismaClient | null }));

vi.mock("@/lib/db", () => ({
  get prisma() {
    if (!dbRef.prisma) throw new Error("Test DB not wired");
    return dbRef.prisma;
  },
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: writeAuditMock,
}));

vi.mock("@/server/_shared", () => ({
  requireAdmin: requireAdminMock,
  safeRevalidatePath: safeRevalidatePathMock,
  actionErrorFromDatabase: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

import { closeWeekAction, reopenWeekAction } from "@/server/weeks";

const YEAR = 2026;
const KWS = [10, 11, 12] as const;

let db: TestDb;
let adminId: string;
let tenantId: string;
let locationId: string;
let weekIds: string[];
let employeeId: string;

async function publishAndCloseWeek(weekId: string) {
  const publishedAt = new Date();
  await db.prisma.week.update({
    where: { id: weekId },
    data: { status: "PUBLISHED", publishedAt },
  });
  await recalcWeekClose(db.prisma, weekId, adminId);
  await db.prisma.week.update({
    where: { id: weekId },
    data: { status: "CLOSED", closedAt: new Date() },
  });
}

function sundayForKw(kw: number): Date {
  return isoWeekDays(YEAR, kw)[6].date;
}

beforeAll(async () => {
  db = makeTestDb();
  dbRef.prisma = db.prisma;
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.reset();
  vi.clearAllMocks();
  writeAuditMock.mockResolvedValue(undefined);
  const admin = await seedAdmin(db.prisma);
  adminId = admin.id;
  const u = await db.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
  tenantId = u.tenantId;
  requireAdminMock.mockResolvedValue({
    id: adminId,
    email: admin.email,
    role: "ADMIN",
    tenantId,
    employeeId: null,
  });
  locationId = await seedLocation(db.prisma, "Loc", "ZH", tenantId);
  weekIds = [];
  for (const kw of KWS) {
    weekIds.push(await seedDraftWeek(db.prisma, YEAR, kw, tenantId));
  }
  const emp = await seedEmployee(db.prisma, { locationId, tenantId });
  employeeId = emp.id;

  for (let i = 0; i < weekIds.length; i++) {
    const wId = weekIds[i];
    const kw = KWS[i];
    const days = isoWeekDays(YEAR, kw).map((d) => d.iso);
    for (let d = 0; d < 5; d++) {
      await seedShiftEntry(db.prisma, {
        weekId: wId,
        employeeId,
        isoDate: days[d],
        plannedMinutes: 540,
      });
    }
    await publishAndCloseWeek(wId);
  }
});

describe("reopenWeekAction cascade", () => {
  it("with cascade=true recreates AUTO_WEEKLY for subsequent closed weeks", async () => {
    const sunday11 = sundayForKw(11).getTime();
    const sunday12 = sundayForKw(12).getTime();

    const bookingsBefore = await db.prisma.booking.findMany({
      where: {
        employeeId,
        bookingType: "AUTO_WEEKLY",
        tenantId,
      },
      orderBy: [{ date: "asc" }, { accountType: "asc" }],
      select: { id: true, date: true, value: true, accountType: true },
    });
    expect(bookingsBefore).toHaveLength(3);
    const beforeW2 = bookingsBefore.filter((b) => b.date.getTime() === sunday11);
    const beforeW3 = bookingsBefore.filter((b) => b.date.getTime() === sunday12);
    expect(beforeW2.length).toBeGreaterThan(0);
    expect(beforeW3.length).toBeGreaterThan(0);

    const result = await reopenWeekAction(weekIds[0], true);
    expect(result).toEqual({ ok: true });

    const w1 = await db.prisma.week.findUniqueOrThrow({
      where: { id: weekIds[0] },
    });
    expect(w1.status).toBe("REOPENED");
    const w2 = await db.prisma.week.findUniqueOrThrow({
      where: { id: weekIds[1] },
    });
    const w3 = await db.prisma.week.findUniqueOrThrow({
      where: { id: weekIds[2] },
    });
    expect(w2.status).toBe("CLOSED");
    expect(w3.status).toBe("CLOSED");

    const bookingsAfter = await db.prisma.booking.findMany({
      where: {
        employeeId,
        bookingType: "AUTO_WEEKLY",
        tenantId,
      },
      orderBy: [{ date: "asc" }, { accountType: "asc" }],
      select: { id: true, date: true, value: true, accountType: true },
    });
    const afterW2 = bookingsAfter.filter((b) => b.date.getTime() === sunday11);
    const afterW3 = bookingsAfter.filter((b) => b.date.getTime() === sunday12);
    expect(
      afterW2.map((b) => b.id).some((id) => beforeW2.some((b) => b.id === id)),
    ).toBe(false);
    expect(
      afterW3.map((b) => b.id).some((id) => beforeW3.some((b) => b.id === id)),
    ).toBe(false);

    const sig = (rows: typeof beforeW2) =>
      rows
        .map((b) => `${b.accountType}:${b.value}`)
        .sort()
        .join("|");
    expect(sig(afterW2)).toBe(sig(beforeW2));
    expect(sig(afterW3)).toBe(sig(beforeW3));

    const reopenAudit = writeAuditMock.mock.calls.find(
      (c) => c[0].action === "REOPEN",
    );
    expect(reopenAudit).toBeDefined();
    expect(reopenAudit![0].newValue).toMatchObject({
      status: "REOPENED",
      cascadeFollowWeeksRecalculated: 2,
    });

    const reclose = await closeWeekAction(weekIds[0]);
    expect(reclose).toEqual({ ok: true });
    const recoseAudit = writeAuditMock.mock.calls.find(
      (c) => c[0].action === "RECLOSE",
    );
    expect(recoseAudit).toBeDefined();
  });

  it("with cascade=false leaves follow weeks' bookings unchanged", async () => {
    const bookingsBefore = await db.prisma.booking.findMany({
      where: {
        employeeId,
        bookingType: "AUTO_WEEKLY",
        tenantId,
      },
      orderBy: [{ date: "asc" }],
      select: { id: true, date: true },
    });
    const idsBefore = bookingsBefore.map((b) => b.id);

    const result = await reopenWeekAction(weekIds[0], false);
    expect(result).toEqual({ ok: true });

    const bookingsAfter = await db.prisma.booking.findMany({
      where: {
        employeeId,
        bookingType: "AUTO_WEEKLY",
        tenantId,
      },
      orderBy: [{ date: "asc" }],
      select: { id: true, date: true },
    });
    const idsAfter = bookingsAfter.map((b) => b.id);
    const sunday10 = sundayForKw(10).getTime();
    const w1BookingId = bookingsBefore.find(
      (b) => b.date.getTime() === sunday10,
    )?.id;
    const followIdsBefore = idsBefore.filter((id) => id !== w1BookingId);
    for (const id of followIdsBefore) {
      expect(idsAfter).toContain(id);
    }

    const reopenAudit = writeAuditMock.mock.calls.find(
      (c) => c[0].action === "REOPEN",
    );
    expect(reopenAudit![0].newValue).toMatchObject({
      cascadeFollowWeeksRecalculated: 0,
    });
  });
});
