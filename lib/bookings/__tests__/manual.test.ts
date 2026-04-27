import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import {
  seedAdmin,
  seedDraftWeek,
  seedEmployee,
  seedLocation,
  seedShiftEntry,
} from "@/lib/test/fixtures";
import {
  applyManualBooking,
  deleteBooking,
  DeleteBookingError,
  ManualBookingError,
  recalcWeekClose,
} from "@/lib/bookings/core";
import { isoWeekDays, parseIsoDate } from "@/lib/time/week";

const YEAR = 2026;
const KW = 10;

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

describe("applyManualBooking", () => {
  it("MANUAL_CREDIT keeps the value sign and increases the balance", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const date = parseIsoDate("2026-03-15")!;

    const result = await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: 60,
      bookingType: "MANUAL_CREDIT",
      comment: "Bonus",
      createdByUserId: adminId,
    });

    expect(result.signedValue).toBe(60);

    const booking = await db.prisma.booking.findUnique({
      where: { id: result.bookingId },
    });
    expect(booking?.value).toBe(60);
    expect(booking?.bookingType).toBe("MANUAL_CREDIT");
    expect(booking?.comment).toBe("Bonus");
    expect(booking?.createdByUserId).toBe(adminId);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(60);
    expect(balance?.openingValue).toBe(0);
  });

  it("MANUAL_DEBIT inverts a positive value to a negative booking", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const date = parseIsoDate("2026-03-15")!;

    const result = await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: 90,
      bookingType: "MANUAL_DEBIT",
      comment: "Korrektur",
      createdByUserId: adminId,
    });

    expect(result.signedValue).toBe(-90);
    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(-90);
  });

  it("MANUAL_DEBIT also normalises an already-negative input to negative", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const date = parseIsoDate("2026-03-15")!;

    const result = await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: -45,
      bookingType: "MANUAL_DEBIT",
      comment: "Abzug",
      createdByUserId: adminId,
    });

    expect(result.signedValue).toBe(-45);
  });

  it("CORRECTION respects the sign of the input value", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const date = parseIsoDate("2026-03-15")!;

    const positive = await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: 30,
      bookingType: "CORRECTION",
      comment: "auf",
      createdByUserId: adminId,
    });
    expect(positive.signedValue).toBe(30);

    const negative = await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: -50,
      bookingType: "CORRECTION",
      comment: "ab",
      createdByUserId: adminId,
    });
    expect(negative.signedValue).toBe(-50);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(-20);
  });

  it("seeds FERIEN with the employee's annual allowance on first booking", async () => {
    const employee = await seedEmployee(db.prisma, {
      locationId,
      vacationDaysPerYear: 28,
    });
    const date = parseIsoDate("2026-03-15")!;

    await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "FERIEN",
      date,
      value: 1,
      bookingType: "MANUAL_CREDIT",
      comment: "+1 Tag",
      createdByUserId: adminId,
    });

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "FERIEN",
          year: YEAR,
        },
      },
    });
    expect(balance?.openingValue).toBe(28);
    expect(balance?.currentValue).toBe(29);
  });

  it("rejects a value of 0", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const date = parseIsoDate("2026-03-15")!;

    await expect(
      applyManualBooking(db.prisma, {
        employeeId: employee.id,
        accountType: "ZEITSALDO",
        date,
        value: 0,
        bookingType: "MANUAL_CREDIT",
        comment: "Null",
        createdByUserId: adminId,
      }),
    ).rejects.toBeInstanceOf(ManualBookingError);
  });

  it("rejects an unknown employee", async () => {
    const date = parseIsoDate("2026-03-15")!;
    await expect(
      applyManualBooking(db.prisma, {
        employeeId: "no-such-employee",
        accountType: "ZEITSALDO",
        date,
        value: 60,
        bookingType: "MANUAL_CREDIT",
        comment: "ghost",
        createdByUserId: adminId,
      }),
    ).rejects.toBeInstanceOf(ManualBookingError);
  });
});

describe("deleteBooking", () => {
  it("deletes a manual booking and recomputes the balance", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const date = parseIsoDate("2026-03-15")!;

    const created = await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: 120,
      bookingType: "MANUAL_CREDIT",
      comment: "vorher",
      createdByUserId: adminId,
    });

    const deleted = await deleteBooking(db.prisma, created.bookingId);
    expect(deleted.value).toBe(120);
    expect(deleted.bookingType).toBe("MANUAL_CREDIT");

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(0);

    const remaining = await db.prisma.booking.findUnique({
      where: { id: created.bookingId },
    });
    expect(remaining).toBeNull();
  });

  it("refuses to delete an AUTO_WEEKLY booking", async () => {
    const weekId = await seedDraftWeek(db.prisma, YEAR, KW);
    const weekDays = isoWeekDays(YEAR, KW).map((d) => d.iso);
    const employee = await seedEmployee(db.prisma, { locationId });
    for (let i = 0; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        plannedMinutes: 540,
      });
    }
    await recalcWeekClose(db.prisma, weekId, adminId);

    const auto = await db.prisma.booking.findFirst({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(auto).not.toBeNull();

    await expect(
      deleteBooking(db.prisma, auto!.id),
    ).rejects.toMatchObject({
      name: "DeleteBookingError",
      code: "AUTO_WEEKLY_PROTECTED",
    });

    const stillThere = await db.prisma.booking.findUnique({
      where: { id: auto!.id },
    });
    expect(stillThere).not.toBeNull();
  });

  it("rejects an unknown booking id", async () => {
    await expect(
      deleteBooking(db.prisma, "no-such-booking"),
    ).rejects.toBeInstanceOf(DeleteBookingError);
  });
});
