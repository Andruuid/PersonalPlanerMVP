import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { addDays } from "date-fns";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { SeededEmployee } from "@/lib/test/fixtures";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import {
  seedAdmin,
  seedDraftWeek,
  seedEmployee,
  seedHoliday,
  seedLocation,
  seedShiftEntry,
} from "@/lib/test/fixtures";
import { currentIsoWeek, isoDateString, parseIsoDate } from "@/lib/time/week";

const prismaHolder = vi.hoisted(() => ({
  p: null as PrismaClient | null,
}));

vi.mock("@/lib/db", () => ({
  get prisma(): PrismaClient {
    const v = prismaHolder.p;
    if (!v) throw new Error("planning test prisma not wired yet");
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

/** Muss zum Mandanten-Feld `Tenant.ertDueDays` passen (Default 28). */
const DEFAULT_ERT_DUE_DAYS = 28;

function dateAtMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function seedDailyShiftsInErtRestWindow(
  prisma: PrismaClient,
  tenantId: string,
  employeeId: string,
  triggerIso: string,
  existingWeeks?: Map<string, string>,
): Promise<void> {
  const triggerDate = new Date(`${triggerIso}T00:00:00`);
  const dueAt = addDays(triggerDate, DEFAULT_ERT_DUE_DAYS);
  const windowStart = addDays(dateAtMidnight(triggerDate), 1);
  const windowEnd = addDays(dateAtMidnight(dueAt), 1);

  const weekCache = new Map<string, string>(existingWeeks);
  for (let cur = windowStart; cur < windowEnd; cur = addDays(cur, 1)) {
    const iso = isoDateString(cur);
    const meta = currentIsoWeek(cur);
    const wkKey = `${meta.year}-${meta.weekNumber}`;
    let weekId = weekCache.get(wkKey);
    if (!weekId) {
      weekId = await seedDraftWeek(prisma, meta.year, meta.weekNumber, tenantId);
      weekCache.set(wkKey, weekId);
    }
    await seedShiftEntry(prisma, {
      weekId,
      employeeId,
      isoDate: iso,
      plannedMinutes: 240,
    });
  }
}
describe("planning ERT sweep on write", () => {
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

  it("upsertPlanEntryAction (Feiertagsarbeit ≥5h) creates an ERT case ohne Wochenabschluss", async () => {
    const holidayIso = "2026-03-30";
    const weekMeta = currentIsoWeek(parseIsoDate(holidayIso)!);
    await seedHoliday(db.prisma, employee.locationId, holidayIso);
    const weekId = await seedDraftWeek(
      db.prisma,
      weekMeta.year,
      weekMeta.weekNumber,
      employee.tenantId,
    );
    const weekPrimers = new Map([[`${weekMeta.year}-${weekMeta.weekNumber}`, weekId]]);

    await seedDailyShiftsInErtRestWindow(
      db.prisma,
      employee.tenantId,
      employee.id,
      holidayIso,
      weekPrimers,
    );

    const result = await upsertPlanEntryAction({
      weekId,
      employeeId: employee.id,
      date: holidayIso,
      kind: "ONE_TIME_SHIFT",
      oneTimeStart: "08:00",
      oneTimeEnd: "15:00",
      oneTimeBreakMinutes: 60,
      oneTimeLabel: "Feiertag",
    });

    expect(result.ok).toBe(true);

    const cases = await db.prisma.ertCase.findMany({
      where: { employeeId: employee.id },
    });
    expect(cases).toHaveLength(1);
  });
});
