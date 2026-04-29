import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedAdmin, seedEmployee, seedLocation } from "@/lib/test/fixtures";
import {
  applyCompensationRedemption,
  CompensationRedemptionError,
} from "@/lib/bookings/core";
import { parseIsoDate } from "@/lib/time/week";

const YEAR = 2026;

let db: TestDb;
let adminId: string;
let locationId: string;

beforeAll(async () => {
  db = makeTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.reset();
  const admin = await seedAdmin(db.prisma);
  adminId = admin.id;
  locationId = await seedLocation(db.prisma);
});

async function seedCompensationBalance(
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
        comment: "Wochenabschluss-Gutschrift (Test)",
        createdByUserId: adminId,
      },
    });
  }
}

describe("applyCompensationRedemption", () => {
  it("posts a negative COMPENSATION_REDEMPTION booking and reduces the balance", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedCompensationBalance(db.prisma, employee.id, employee.tenantId, 240);

    const result = await applyCompensationRedemption(db.prisma, {
      employeeId: employee.id,
      tenantId: employee.tenantId,
      date: parseIsoDate(`${YEAR}-03-15`)!,
      minutes: 90,
      comment: "Bezug Ruhezeit",
      createdByUserId: adminId,
    });

    expect(result.signedValue).toBe(-90);

    const booking = await db.prisma.booking.findUnique({
      where: { id: result.bookingId },
    });
    expect(booking?.bookingType).toBe("COMPENSATION_REDEMPTION");
    expect(booking?.accountType).toBe("SONNTAG_FEIERTAG_KOMPENSATION");
    expect(booking?.value).toBe(-90);
    expect(booking?.comment).toBe("Bezug Ruhezeit");

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(150);
  });

  it("rejects non-positive minutes", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedCompensationBalance(db.prisma, employee.id, employee.tenantId, 60);

    await expect(
      applyCompensationRedemption(db.prisma, {
        employeeId: employee.id,
        tenantId: employee.tenantId,
        date: parseIsoDate(`${YEAR}-03-15`)!,
        minutes: 0,
        comment: "leer",
        createdByUserId: adminId,
      }),
    ).rejects.toMatchObject({
      name: "CompensationRedemptionError",
      code: "NON_POSITIVE_MINUTES",
    });

    await expect(
      applyCompensationRedemption(db.prisma, {
        employeeId: employee.id,
        tenantId: employee.tenantId,
        date: parseIsoDate(`${YEAR}-03-15`)!,
        minutes: -5,
        comment: "negativ",
        createdByUserId: adminId,
      }),
    ).rejects.toBeInstanceOf(CompensationRedemptionError);
  });

  it("rejects redemptions exceeding the available balance", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedCompensationBalance(db.prisma, employee.id, employee.tenantId, 30);

    await expect(
      applyCompensationRedemption(db.prisma, {
        employeeId: employee.id,
        tenantId: employee.tenantId,
        date: parseIsoDate(`${YEAR}-03-15`)!,
        minutes: 60,
        comment: "zu viel",
        createdByUserId: adminId,
      }),
    ).rejects.toMatchObject({
      name: "CompensationRedemptionError",
      code: "INSUFFICIENT_BALANCE",
    });

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(30);

    const bookings = await db.prisma.booking.findMany({
      where: {
        employeeId: employee.id,
        bookingType: "COMPENSATION_REDEMPTION",
      },
    });
    expect(bookings).toHaveLength(0);
  });

  it("rejects redemptions on a missing balance row (no AUTO_WEEKLY ever ran)", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });

    await expect(
      applyCompensationRedemption(db.prisma, {
        employeeId: employee.id,
        tenantId: employee.tenantId,
        date: parseIsoDate(`${YEAR}-03-15`)!,
        minutes: 30,
        comment: "ohne Saldo",
        createdByUserId: adminId,
      }),
    ).rejects.toMatchObject({
      name: "CompensationRedemptionError",
      code: "INSUFFICIENT_BALANCE",
    });
  });

  it("rejects an unknown employee", async () => {
    await expect(
      applyCompensationRedemption(db.prisma, {
        employeeId: "no-such-employee",
        date: parseIsoDate(`${YEAR}-03-15`)!,
        minutes: 30,
        comment: "ghost",
        createdByUserId: adminId,
      }),
    ).rejects.toMatchObject({
      name: "CompensationRedemptionError",
      code: "EMPLOYEE_NOT_FOUND",
    });
  });
});
