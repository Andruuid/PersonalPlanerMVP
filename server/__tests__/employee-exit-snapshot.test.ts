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
import { seedAdmin, seedEmployee, seedLocation } from "@/lib/test/fixtures";
import { parseExitSnapshotJson } from "@/lib/employee/exit-snapshot";

const prismaRef = vi.hoisted(() => ({
  client: null as PrismaClient | null,
}));

vi.mock("@/lib/db", () => ({
  prisma: new Proxy({} as PrismaClient, {
    get(_target, prop) {
      const c = prismaRef.client;
      if (!c) throw new Error("Test Prisma client not wired");
      const v = Reflect.get(c, prop, c);
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
    },
  }),
}));

const authState = vi.hoisted(() => ({
  user: {
    id: "",
    email: "admin@test.local",
    role: "ADMIN" as const,
    tenantId: "",
    employeeId: null as string | null,
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: authState.user })),
}));

const safeRevalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/_shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/_shared")>();
  return {
    ...actual,
    safeRevalidatePath: safeRevalidatePathMock,
  };
});

import { updateEmployeeAction } from "@/server/employees";

let db: TestDb;
let tenantId: string;
let employeeId: string;

beforeAll(async () => {
  db = makeTestDb();
  prismaRef.client = db.prisma;
});

afterAll(async () => {
  await db.close();
  prismaRef.client = null;
});

beforeEach(async () => {
  await db.reset();
  safeRevalidatePathMock.mockClear();
  const admin = await seedAdmin(db.prisma);
  authState.user.id = admin.id;
  const locationId = await seedLocation(db.prisma);
  const emp = await seedEmployee(db.prisma, {
    locationId,
    entryDate: new Date(2024, 0, 10),
    exitDate: null,
  });
  tenantId = emp.tenantId;
  authState.user.tenantId = tenantId;
  employeeId = emp.id;

  await db.prisma.accountBalance.createMany({
    data: [
      {
        tenantId,
        employeeId,
        accountType: "ZEITSALDO",
        year: 2026,
        openingValue: 0,
        currentValue: 123.5,
        unit: "MINUTES",
      },
      {
        tenantId,
        employeeId,
        accountType: "FERIEN",
        year: 2026,
        openingValue: 5,
        currentValue: 7.25,
        unit: "DAYS",
      },
    ],
  });
});

describe("EmployeeExitSnapshot on exit date", () => {
  it("persistiert Snapshot mit korrekten currentValue-Werten und Audit EXIT_SNAPSHOT", async () => {
    const empBefore = await db.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    expect(empBefore?.exitDate).toBeNull();

    const fd = new FormData();
    fd.set("id", employeeId);
    fd.set("email", empBefore!.user.email);
    fd.set("password", "");
    fd.set("firstName", empBefore!.firstName);
    fd.set("lastName", empBefore!.lastName);
    fd.set("roleLabel", "");
    fd.set("pensum", "100");
    fd.set("entryDate", "2024-01-10");
    fd.set("exitDate", "2026-01-15");
    fd.set("locationId", empBefore!.locationId);
    fd.set("vacationDaysPerYear", "25");
    fd.set("weeklyTargetMinutes", "2520");
    fd.set("hazMinutesPerWeek", "2700");
    fd.set("tztModel", "DAILY_QUOTA");
    fd.set("isActive", "on");

    const result = await updateEmployeeAction(undefined, fd);
    expect(result.ok).toBe(true);

    const snap = await db.prisma.employeeExitSnapshot.findUnique({
      where: { employeeId },
    });
    expect(snap).not.toBeNull();

    const parsed = parseExitSnapshotJson(snap!.snapshotJson);
    expect(parsed).not.toBeNull();
    const zeit = parsed!.accounts.find((a) => a.accountType === "ZEITSALDO");
    const ferien = parsed!.accounts.find((a) => a.accountType === "FERIEN");
    expect(zeit?.currentValue).toBe(123.5);
    expect(ferien?.currentValue).toBe(7.25);

    const audit = await db.prisma.auditLog.findFirst({
      where: { action: "EXIT_SNAPSHOT", entityId: employeeId },
    });
    expect(audit).not.toBeNull();
    expect(audit!.entity).toBe("Employee");
  });
});
