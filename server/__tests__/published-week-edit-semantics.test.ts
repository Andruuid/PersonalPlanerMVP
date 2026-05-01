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
  seedAbsenceEntry,
  seedDraftWeek,
  seedEmployee,
  seedLocation,
} from "@/lib/test/fixtures";
import { currentIsoWeek, parseIsoDate } from "@/lib/time/week";
import { loadMyWeek } from "@/lib/employee/my-week";

const prismaHolder = vi.hoisted(() => ({
  p: null as PrismaClient | null,
}));

vi.mock("@/lib/db", () => ({
  get prisma(): PrismaClient {
    const v = prismaHolder.p;
    if (!v) throw new Error("published-week semantics test prisma not wired yet");
    return v;
  },
}));
vi.mock("server-only", () => ({}));

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

describe("published-week edit semantics", () => {
  let db: TestDb;
  let upsertPlanEntryAction: typeof import("../planning").upsertPlanEntryAction;
  let resetWeekToDraftAction: typeof import("../weeks").resetWeekToDraftAction;
  let publishWeekAction: typeof import("../weeks").publishWeekAction;
  let employee: SeededEmployee;

  beforeAll(async () => {
    db = makeTestDb();
    ({ upsertPlanEntryAction } = await import("../planning"));
    ({ resetWeekToDraftAction, publishWeekAction } = await import("../weeks"));
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

  it("blocks edits in PUBLISHED, allows edits after reset-to-draft, and keeps employee view on last snapshot", async () => {
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
      absenceType: "VACATION",
    });

    const publishResult = await publishWeekAction(weekId);
    expect(publishResult.ok).toBe(true);

    const blocked = await upsertPlanEntryAction({
      weekId,
      employeeId: employee.id,
      date: iso,
      kind: "ABSENCE",
      absenceType: "SICK",
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error).toContain("zurücksetzen");
    }

    const beforeResetEmployeeWeek = await loadMyWeek(
      { tenantId: employee.tenantId },
      employee.id,
      employee.locationId,
      { year: meta.year, weekNumber: meta.weekNumber },
      { year: meta.year, weekNumber: meta.weekNumber },
    );
    const dayBeforeReset = beforeResetEmployeeWeek.days.find((d) => d.iso === iso);
    expect(dayBeforeReset?.title).toBe("Ferien");

    const resetResult = await resetWeekToDraftAction(weekId);
    expect(resetResult).toEqual({ ok: true });

    const allowed = await upsertPlanEntryAction({
      weekId,
      employeeId: employee.id,
      date: iso,
      kind: "ABSENCE",
      absenceType: "SICK",
    });
    expect(allowed.ok).toBe(true);

    const week = await db.prisma.week.findUnique({ where: { id: weekId } });
    expect(week?.status).toBe("DRAFT");

    const afterResetEmployeeWeek = await loadMyWeek(
      { tenantId: employee.tenantId },
      employee.id,
      employee.locationId,
      { year: meta.year, weekNumber: meta.weekNumber },
      { year: meta.year, weekNumber: meta.weekNumber },
    );
    const dayAfterReset = afterResetEmployeeWeek.days.find(
      (d) => d.iso === iso,
    );
    expect(dayAfterReset?.title).toBe("Ferien");
  });
});
