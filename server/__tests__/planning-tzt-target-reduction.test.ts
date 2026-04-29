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
import { currentIsoWeek, parseIsoDate } from "@/lib/time/week";

const prismaHolder = vi.hoisted(() => ({
  p: null as PrismaClient | null,
}));

vi.mock("@/lib/db", () => ({
  get prisma(): PrismaClient {
    const v = prismaHolder.p;
    if (!v) throw new Error("planning-tzt-target-reduction prisma not wired");
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

describe("planning — TZT absence vs TARGET_REDUCTION", () => {
  let db: TestDb;
  let upsertPlanEntryAction: typeof import("../planning").upsertPlanEntryAction;
  let quickSetPlanEntryAction: typeof import("../planning").quickSetPlanEntryAction;

  beforeAll(async () => {
    db = makeTestDb();
    ({ upsertPlanEntryAction, quickSetPlanEntryAction } = await import(
      "../planning"
    ));
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.reset();
    prismaHolder.p = db.prisma;
    await seedAdmin(db.prisma);
  });

  async function seedEmpAndWeek(tztModel: "DAILY_QUOTA" | "TARGET_REDUCTION"): Promise<{
    employee: SeededEmployee;
    weekId: string;
    isoDate: string;
  }> {
    const locationId = await seedLocation(db.prisma);
    const employee = await seedEmployee(db.prisma, {
      locationId,
      tztModel,
    });
    const isoDate = "2026-04-13";
    const weekMeta = currentIsoWeek(parseIsoDate(isoDate)!);
    const weekId = await seedDraftWeek(
      db.prisma,
      weekMeta.year,
      weekMeta.weekNumber,
      employee.tenantId,
    );
    requireAdminFn.mockResolvedValue({
      id: "admin-session",
      email: "a@test.local",
      tenantId: employee.tenantId,
      role: "ADMIN",
    });
    return { employee, weekId, isoDate };
  }

  it("upsertPlanEntryAction lehnt ABSENCE/TZT bei TARGET_REDUCTION ab", async () => {
    const { employee, weekId, isoDate } = await seedEmpAndWeek(
      "TARGET_REDUCTION",
    );

    const result = await upsertPlanEntryAction({
      weekId,
      employeeId: employee.id,
      date: isoDate,
      kind: "ABSENCE",
      absenceType: "TZT",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("TZT-Bezug nicht vorgesehen");
    expect(result.error).toContain("Sollzeit-Reduktion");
  });

  it("quickSetPlanEntryAction (TZT) lehnt bei TARGET_REDUCTION ab", async () => {
    const { employee, weekId, isoDate } = await seedEmpAndWeek(
      "TARGET_REDUCTION",
    );

    const result = await quickSetPlanEntryAction(
      weekId,
      employee.id,
      isoDate,
      "TZT",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("TZT-Bezug nicht vorgesehen");
  });

  it("upsertPlanEntryAction erlaubt ABSENCE/TZT bei DAILY_QUOTA", async () => {
    const { employee, weekId, isoDate } = await seedEmpAndWeek("DAILY_QUOTA");

    const result = await upsertPlanEntryAction({
      weekId,
      employeeId: employee.id,
      date: isoDate,
      kind: "ABSENCE",
      absenceType: "TZT",
    });

    expect(result.ok).toBe(true);
  });
});
