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

import { payoutUezAction } from "@/server/bookings";

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

async function seedUezBalance(
  prisma: TestDb["prisma"],
  employeeId: string,
  tenantId: string,
  minutes: number,
): Promise<void> {
  await prisma.accountBalance.create({
    data: {
      tenantId,
      employeeId,
      accountType: "UEZ",
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
        accountType: "UEZ",
        date: parseIsoDate(`${YEAR}-03-08`)!,
        value: minutes,
        bookingType: "MANUAL_CREDIT",
        comment: "Test Gutschrift UEZ",
        createdByUserId: adminId,
      },
    });
  }
}

function buildPayoutFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("employeeId", "emp-placeholder");
  fd.set("date", `${YEAR}-03-15`);
  fd.set("minutes", "300");
  fd.set("comment", "Auszahlung gemäss Antrag");
  for (const [k, v] of Object.entries(overrides)) {
    fd.set(k, v);
  }
  return fd;
}

describe("payoutUezAction", () => {
  it("reduces UEZ balance, persists UEZ_PAYOUT booking, and writes audit", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedUezBalance(db.prisma, employee.id, employee.tenantId, 600);

    const fd = buildPayoutFormData({
      employeeId: employee.id,
      minutes: "300",
    });

    const result = await payoutUezAction(undefined, fd);
    expect(result.ok).toBe(true);

    const payout = await db.prisma.booking.findFirst({
      where: { employeeId: employee.id, bookingType: "UEZ_PAYOUT" },
    });
    expect(payout).not.toBeNull();
    expect(payout?.accountType).toBe("UEZ");
    expect(payout?.value).toBe(-300);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "UEZ",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(300);

    const audits = await db.prisma.auditLog.findMany({
      where: { action: "UEZ_PAYOUT" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.entity).toBe("Booking");
    expect(audits[0]?.entityId).toBe(payout?.id);
    const audited = JSON.parse(audits[0]?.newValue ?? "{}") as {
      bookingType?: string;
      policy?: string;
    };
    expect(audited.bookingType).toBe("UEZ_PAYOUT");
    expect(audited.policy).toBe("ALLOWED");
  });

  it("returns ok=false when payout exceeds UEZ balance", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedUezBalance(db.prisma, employee.id, employee.tenantId, 100);

    const fd = buildPayoutFormData({
      employeeId: employee.id,
      minutes: "200",
    });

    const result = await payoutUezAction(undefined, fd);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/nicht genug|UEZ/i);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "UEZ",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(100);

    const payouts = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "UEZ_PAYOUT" },
    });
    expect(payouts).toHaveLength(0);
  });
});
