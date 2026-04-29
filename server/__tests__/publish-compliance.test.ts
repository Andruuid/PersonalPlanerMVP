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
import { isoWeekDays } from "@/lib/time/week";

const prismaHolder = vi.hoisted(() => ({
  p: null as PrismaClient | null,
}));

vi.mock("@/lib/db", () => ({
  get prisma(): PrismaClient {
    const v = prismaHolder.p;
    if (!v) throw new Error("publish-compliance test prisma not wired yet");
    return v;
  },
}));

const requireAdminFn = vi.hoisted(() => vi.fn());
const writeAuditMock = vi.hoisted(() => vi.fn());
const safeRevalidatePathMock = vi.hoisted(() => vi.fn());

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

describe("publishWeekAction — Pflicht-Verstöße", () => {
  let db: TestDb;
  let publishWeekAction: typeof import("../weeks").publishWeekAction;

  beforeAll(async () => {
    db = makeTestDb();
    ({ publishWeekAction } = await import("../weeks"));
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.reset();
    prismaHolder.p = db.prisma;

    await seedAdmin(db.prisma);
    requireAdminFn.mockResolvedValue({
      id: "admin-session",
      email: "a@test.local",
      tenantId: "test-default",
      role: "ADMIN",
    });
    writeAuditMock.mockResolvedValue(undefined);
  });

  it("blockt Publish bei Verstoss ohne Begründung (ActionResult + fieldErrors)", async () => {
    const locationId = await seedLocation(db.prisma);
    const employee = await seedEmployee(db.prisma, { locationId });
    const weekId = await seedDraftWeek(db.prisma, 2026, 17, employee.tenantId);
    const days = isoWeekDays(2026, 17);
    for (let i = 0; i < 6; i += 1) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: days[i]!.iso,
        plannedMinutes: 480,
      });
    }

    const blocked = await publishWeekAction(weekId);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("expected block");
    expect(blocked.error).toMatch(/Pflicht-Verstöße/);
    expect(blocked.fieldErrors?.override).toMatch(/10 Zeichen/);

    const w = await db.prisma.week.findUnique({ where: { id: weekId } });
    expect(w?.status).toBe("DRAFT");
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("erlaubt Publish mit Begründung und schreibt PUBLISH_WITH_OVERRIDE-Audit", async () => {
    const locationId = await seedLocation(db.prisma);
    const employee = await seedEmployee(db.prisma, { locationId });
    const weekId = await seedDraftWeek(db.prisma, 2026, 17, employee.tenantId);
    const days = isoWeekDays(2026, 17);
    for (let i = 0; i < 6; i += 1) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: days[i]!.iso,
        plannedMinutes: 480,
      });
    }

    const ok = await publishWeekAction(
      weekId,
      "Notfallplanung, Personal knapp.",
    );
    expect(ok.ok).toBe(true);

    const w = await db.prisma.week.findUnique({ where: { id: weekId } });
    expect(w?.status).toBe("PUBLISHED");

    const overrideAudit = writeAuditMock.mock.calls.find(
      (c) => (c[0] as { action?: string }).action === "PUBLISH_WITH_OVERRIDE",
    );
    expect(overrideAudit).toBeDefined();
    const payload = overrideAudit![0] as {
      action: string;
      comment: string;
      newValue: { violations?: unknown[]; status: string };
    };
    expect(payload.comment).toBe("Notfallplanung, Personal knapp.");
    expect(Array.isArray(payload.newValue.violations)).toBe(true);
    expect(payload.newValue.violations!.length).toBeGreaterThanOrEqual(1);
  });
});
