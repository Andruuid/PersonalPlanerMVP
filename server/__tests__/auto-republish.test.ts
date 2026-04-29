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
import type { SeededEmployee } from "@/lib/test/fixtures";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import {
  seedAdmin,
  seedDraftWeek,
  seedEmployee,
  seedLocation,
} from "@/lib/test/fixtures";
import { seedAbsenceEntry } from "@/lib/test/fixtures";
import { currentIsoWeek, parseIsoDate } from "@/lib/time/week";
import { buildWeekSnapshot } from "@/server/weeks";

const prismaHolder = vi.hoisted(() => ({
  p: null as PrismaClient | null,
}));

vi.mock("@/lib/db", () => ({
  get prisma(): PrismaClient {
    const v = prismaHolder.p;
    if (!v) throw new Error("auto-republish test prisma not wired yet");
    return v;
  },
}));

const requireAdminFn = vi.hoisted(() => vi.fn());
const writeAuditMock = vi.fn();
const safeRevalidatePathMock = vi.fn();

vi.mock("@/lib/audit", () => ({
  writeAudit: (...args: unknown[]) => writeAuditMock(...args),
}));

vi.mock("@/server/_shared", () => ({
  requireAdmin: () => requireAdminFn(),
  fieldErrorsFromZod: vi.fn(),
  actionErrorFromDatabase: vi.fn(() => "database error"),
  logServerError: vi.fn(),
  safeRevalidatePath: (...args: unknown[]) =>
    safeRevalidatePathMock(...args),
}));

describe("auto-republish PUBLISHED week on priority absence", () => {
  let db: TestDb;
  let upsertPlanEntryAction: typeof import("../planning").upsertPlanEntryAction;
  let employee: SeededEmployee;

  beforeAll(async () => {
    db = makeTestDb();
    ({ upsertPlanEntryAction } = await import("../planning"));
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.reset();
    prismaHolder.p = db.prisma;

    await seedAdmin(db.prisma);
    const locationId = await seedLocation(db.prisma);
    employee = await seedEmployee(db.prisma, { locationId });
    requireAdminFn.mockResolvedValue({
      id: "admin-session",
      email: "a@test.local",
      tenantId: employee.tenantId,
      role: "ADMIN",
    });
  });

  it("ABSENCE/SICK in PUBLISHED week creates new snapshot, keeps PUBLISHED, audits REPUBLISH_AUTO", async () => {
    const iso = "2026-04-28";
    const meta = currentIsoWeek(parseIsoDate(iso)!);
    const weekId = await seedDraftWeek(
      db.prisma,
      meta.year,
      meta.weekNumber,
      employee.tenantId,
    );
    await seedAbsenceEntry(db.prisma, {
      weekId,
      employeeId: employee.id,
      isoDate: iso,
      absenceType: "TZT",
    });

    const initialSnapshot = await buildWeekSnapshot(weekId, employee.tenantId);
    const publishedAt0 = new Date();
    await db.prisma.publishedSnapshot.create({
      data: {
        tenantId: employee.tenantId,
        weekId,
        snapshotJson: JSON.stringify(initialSnapshot),
        publishedAt: publishedAt0,
      },
    });
    await db.prisma.week.update({
      where: { id: weekId },
      data: { status: "PUBLISHED", publishedAt: publishedAt0 },
    });

    const result = await upsertPlanEntryAction({
      weekId,
      employeeId: employee.id,
      date: iso,
      kind: "ABSENCE",
      absenceType: "SICK",
    });

    expect(result).toMatchObject({
      ok: true,
      data: { autoRepublished: true },
    });

    const week = await db.prisma.week.findUnique({ where: { id: weekId } });
    expect(week?.status).toBe("PUBLISHED");

    const snaps = await db.prisma.publishedSnapshot.findMany({
      where: { weekId },
      orderBy: { publishedAt: "asc" },
    });
    expect(snaps.length).toBe(2);

    const latest = JSON.parse(snaps[1]!.snapshotJson) as {
      entries: Array<{ date: string; employeeId: string; absenceType: string | null }>;
    };
    const dayEntry = latest.entries.find(
      (e) => e.date === iso && e.employeeId === employee.id,
    );
    expect(dayEntry?.absenceType).toBe("SICK");

    const republishAudit = writeAuditMock.mock.calls.find(
      (c) => c[0]?.action === "REPUBLISH_AUTO",
    );
    expect(republishAudit).toBeDefined();
    expect(republishAudit![0]).toMatchObject({
      action: "REPUBLISH_AUTO",
      entity: "Week",
      entityId: weekId,
      comment:
        "Auto-Republish wegen prioritätsverändernden Eintrags (SICK/ACCIDENT)",
    });
  });
});
