import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import {
  seedAdmin,
  seedEmployee,
  seedLocation,
} from "@/lib/test/fixtures";
import {
  applyManualBooking,
  applyYearEndCarryover,
} from "@/lib/bookings/core";
import { parseIsoDate } from "@/lib/time/week";

const FROM_YEAR = 2025;
const TO_YEAR = 2026;

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

describe("applyYearEndCarryover", () => {
  it("carries Zeitsaldo 1:1 into the new year as a CARRYOVER booking", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const date = parseIsoDate(`${FROM_YEAR}-12-15`)!;
    await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: 500,
      bookingType: "MANUAL_CREDIT",
      comment: "leftover",
      createdByUserId: adminId,
    });

    const result = await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);
    expect(result.fromYear).toBe(FROM_YEAR);
    expect(result.toYear).toBe(TO_YEAR);
    expect(result.employeesProcessed).toBe(1);
    expect(result.bookingsCreated).toBe(1);

    const newYearBalance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: TO_YEAR,
        },
      },
    });
    expect(newYearBalance?.openingValue).toBe(0);
    expect(newYearBalance?.currentValue).toBe(500);

    const carry = await db.prisma.booking.findFirst({
      where: {
        employeeId: employee.id,
        accountType: "ZEITSALDO",
        bookingType: "CARRYOVER",
      },
    });
    expect(carry?.value).toBe(500);
    expect(carry?.comment).toBe(`Vortrag aus ${FROM_YEAR}`);
    expect(carry?.date.getFullYear()).toBe(TO_YEAR);
    expect(carry?.date.getMonth()).toBe(0);
    expect(carry?.date.getDate()).toBe(1);
  });

  it("opens FERIEN at the annual allowance and carries leftover days on top", async () => {
    const employee = await seedEmployee(db.prisma, {
      locationId,
      vacationDaysPerYear: 25,
    });
    const date = parseIsoDate(`${FROM_YEAR}-12-15`)!;

    // Open the FERIEN row at 25 with a manual debit of 13 → currentValue = 12
    await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "FERIEN",
      date,
      value: 13,
      bookingType: "MANUAL_DEBIT",
      comment: "Bezogen",
      createdByUserId: adminId,
    });

    const closing = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "FERIEN",
          year: FROM_YEAR,
        },
      },
    });
    expect(closing?.currentValue).toBe(12);

    await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);

    const newYear = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "FERIEN",
          year: TO_YEAR,
        },
      },
    });
    expect(newYear?.openingValue).toBe(25);
    expect(newYear?.currentValue).toBe(37);
  });

  it("does not write a CARRYOVER booking when closing balance is 0", async () => {
    await seedEmployee(db.prisma, { locationId });

    const result = await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);
    expect(result.bookingsCreated).toBe(0);

    const carry = await db.prisma.booking.findMany({
      where: { bookingType: "CARRYOVER" },
    });
    expect(carry).toHaveLength(0);
  });

  it("is idempotent: re-running replaces prior CARRYOVER bookings, not stacks them", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const date = parseIsoDate(`${FROM_YEAR}-12-15`)!;
    await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: 500,
      bookingType: "MANUAL_CREDIT",
      comment: "leftover",
      createdByUserId: adminId,
    });

    await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);
    await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);

    const carryBookings = await db.prisma.booking.findMany({
      where: {
        employeeId: employee.id,
        accountType: "ZEITSALDO",
        bookingType: "CARRYOVER",
      },
    });
    expect(carryBookings).toHaveLength(1);
    expect(carryBookings[0].value).toBe(500);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: TO_YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(500);
  });

  it("reflects mid-year balance changes when re-run", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const date = parseIsoDate(`${FROM_YEAR}-12-15`)!;
    await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: 500,
      bookingType: "MANUAL_CREDIT",
      comment: "round 1",
      createdByUserId: adminId,
    });

    await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);

    // Closing balance for fromYear later changes — admin re-runs
    await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: 100,
      bookingType: "MANUAL_CREDIT",
      comment: "round 2",
      createdByUserId: adminId,
    });

    await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);

    const newYearBalance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: TO_YEAR,
        },
      },
    });
    expect(newYearBalance?.currentValue).toBe(600);
  });

  it("processes every active employee, skipping inactives", async () => {
    const active1 = await seedEmployee(db.prisma, { locationId });
    const active2 = await seedEmployee(db.prisma, { locationId });
    const inactive = await seedEmployee(db.prisma, {
      locationId,
      isActive: false,
    });

    const date = parseIsoDate(`${FROM_YEAR}-12-15`)!;
    for (const e of [active1, active2, inactive]) {
      await applyManualBooking(db.prisma, {
        employeeId: e.id,
        accountType: "ZEITSALDO",
        date,
        value: 100,
        bookingType: "MANUAL_CREDIT",
        comment: "leftover",
        createdByUserId: adminId,
      });
    }

    const result = await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);
    expect(result.employeesProcessed).toBe(2);
    expect(result.bookingsCreated).toBe(2);

    const inactiveCarry = await db.prisma.booking.findFirst({
      where: { employeeId: inactive.id, bookingType: "CARRYOVER" },
    });
    expect(inactiveCarry).toBeNull();
  });

  it("skips active employees who enter after carryover date", async () => {
    const futureJoiner = await seedEmployee(db.prisma, {
      locationId,
      entryDate: new Date(TO_YEAR, 0, 2),
    });
    await db.prisma.accountBalance.create({
      data: {
        employeeId: futureJoiner.id,
        accountType: "ZEITSALDO",
        year: FROM_YEAR,
        openingValue: 0,
        currentValue: 100,
        unit: "MINUTES",
      },
    });

    const result = await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);
    expect(result.employeesProcessed).toBe(0);

    const carry = await db.prisma.booking.findFirst({
      where: { employeeId: futureJoiner.id, bookingType: "CARRYOVER" },
    });
    expect(carry).toBeNull();
  });

  it("skips active employees who exited before carryover date", async () => {
    const exited = await seedEmployee(db.prisma, {
      locationId,
      exitDate: new Date(FROM_YEAR, 11, 31),
    });

    const date = parseIsoDate(`${FROM_YEAR}-12-15`)!;
    await applyManualBooking(db.prisma, {
      employeeId: exited.id,
      accountType: "ZEITSALDO",
      date,
      value: 100,
      bookingType: "MANUAL_CREDIT",
      comment: "leftover",
      createdByUserId: adminId,
    });

    const result = await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);
    expect(result.employeesProcessed).toBe(0);

    const carry = await db.prisma.booking.findFirst({
      where: { employeeId: exited.id, bookingType: "CARRYOVER" },
    });
    expect(carry).toBeNull();
  });

  it("includes active employees when entryDate or exitDate equals carryover date", async () => {
    const startsOnCarryDate = await seedEmployee(db.prisma, {
      locationId,
      entryDate: new Date(TO_YEAR, 0, 1),
    });
    const exitsOnCarryDate = await seedEmployee(db.prisma, {
      locationId,
      exitDate: new Date(TO_YEAR, 0, 1),
    });

    await db.prisma.accountBalance.create({
      data: {
        employeeId: startsOnCarryDate.id,
        accountType: "ZEITSALDO",
        year: FROM_YEAR,
        openingValue: 0,
        currentValue: 100,
        unit: "MINUTES",
      },
    });
    await db.prisma.accountBalance.create({
      data: {
        employeeId: exitsOnCarryDate.id,
        accountType: "ZEITSALDO",
        year: FROM_YEAR,
        openingValue: 0,
        currentValue: 100,
        unit: "MINUTES",
      },
    });

    const result = await applyYearEndCarryover(db.prisma, FROM_YEAR, adminId);
    expect(result.employeesProcessed).toBe(2);
    expect(result.bookingsCreated).toBe(2);
  });
});
