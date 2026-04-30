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
import { parseIsoDate } from "@/lib/time/week";

const YEAR = 2026;

const prismaRef = vi.hoisted(() => ({
  client: null as PrismaClient | null,
}));

vi.mock("@/lib/db", () => ({
  prisma: new Proxy({} as PrismaClient, {
    get(_target, prop, _receiver) {
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
    tenantId: "test-default",
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

import { correctCompensationAction } from "@/server/bookings";

let db: TestDb;
let adminId: string;
let locationId: string;

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
  adminId = admin.id;
  authState.user.id = admin.id;
  locationId = await seedLocation(db.prisma);
});

async function seedCompensationMinutes(
  prisma: TestDb["prisma"],
  employeeId: string,
  tenantId: string,
  minutes: number,
): Promise<void> {
  await prisma.accountBalance.create({
    data: {
      tenantId,
      employeeId,
      accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
      year: YEAR,
      openingValue: 0,
      currentValue: minutes,
      unit: "MINUTES",
    },
  });
  if (minutes !== 0) {
    await prisma.booking.create({
      data: {
        tenantId,
        employeeId,
        accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
        date: parseIsoDate(`${YEAR}-03-08`)!,
        value: minutes,
        bookingType: "AUTO_WEEKLY",
        comment: "Test Wochensaldo",
        createdByUserId: adminId,
      },
    });
  }
}

function buildCorrectionFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("employeeId", "emp-placeholder");
  fd.set("date", `${YEAR}-03-15`);
  fd.set("minutes", "30");
  fd.set("correctionSign", "plus");
  fd.set("comment", "Korr wegen Datenfehler");
  for (const [k, v] of Object.entries(overrides)) {
    fd.set(k, v);
  }
  return fd;
}

describe("correctCompensationAction", () => {
  it("posts positive CORRECTION, updates balance, and writes COMPENSATION_CORRECTION audit", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedCompensationMinutes(db.prisma, employee.id, employee.tenantId, 120);

    const fd = buildCorrectionFormData({
      employeeId: employee.id,
      minutes: "40",
      correctionSign: "plus",
    });

    const result = await correctCompensationAction(undefined, fd);
    expect(result.ok).toBe(true);

    const corr = await db.prisma.booking.findFirst({
      where: {
        employeeId: employee.id,
        accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
        bookingType: "CORRECTION",
      },
    });
    expect(corr).not.toBeNull();
    expect(corr?.value).toBe(40);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(160);

    const audits = await db.prisma.auditLog.findMany({
      where: { action: "COMPENSATION_CORRECTION" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.entity).toBe("Booking");
    expect(audits[0]?.entityId).toBe(corr?.id);
    const audited = JSON.parse(audits[0]?.newValue ?? "{}") as {
      bookingType?: string;
      value?: number;
    };
    expect(audited.bookingType).toBe("CORRECTION");
    expect(audited.value).toBe(40);
  });

  it("posts negative CORRECTION when balance remains non-negative", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedCompensationMinutes(db.prisma, employee.id, employee.tenantId, 200);

    const fd = buildCorrectionFormData({
      employeeId: employee.id,
      minutes: "80",
      correctionSign: "minus",
    });

    const result = await correctCompensationAction(undefined, fd);
    expect(result.ok).toBe(true);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(120);
  });

  it("rejects correction that would make balance negative", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedCompensationMinutes(db.prisma, employee.id, employee.tenantId, 50);

    const fd = buildCorrectionFormData({
      employeeId: employee.id,
      minutes: "80",
      correctionSign: "minus",
    });

    const result = await correctCompensationAction(undefined, fd);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Korrektur würde Saldo unter 0 bringen.");

    const corrections = await db.prisma.booking.findMany({
      where: {
        employeeId: employee.id,
        bookingType: "CORRECTION",
      },
    });
    expect(corrections).toHaveLength(0);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(50);
  });

  it("rejects zero minutes via validation", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedCompensationMinutes(db.prisma, employee.id, employee.tenantId, 10);

    const fd = buildCorrectionFormData({
      employeeId: employee.id,
      minutes: "0",
    });

    const result = await correctCompensationAction(undefined, fd);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Bitte Eingaben prüfen.");
    expect(result.fieldErrors?.minutes).toMatch(/grösser als 0|0/i);
  });
});
