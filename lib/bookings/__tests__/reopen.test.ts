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
  recalcWeekClose,
  removeWeekClosingBookings,
} from "@/lib/bookings/core";
import { isoWeekDays, parseIsoDate } from "@/lib/time/week";

const YEAR = 2026;
const KW = 10;

let db: TestDb;
let adminId: string;
let locationId: string;
let weekId: string;
let weekDays: string[];

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
  weekId = await seedDraftWeek(db.prisma, YEAR, KW);
  weekDays = isoWeekDays(YEAR, KW).map((d) => d.iso);
});

describe("removeWeekClosingBookings", () => {
  it("removes the AUTO_WEEKLY bookings created by recalc and recomputes balances", async () => {
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

    const result = await removeWeekClosingBookings(db.prisma, weekId);

    expect(result.bookingsRemoved).toBe(1);
    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(bookings).toHaveLength(0);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    // The balance row stays (it was opened at 0); current resets to opening
    expect(balance?.currentValue).toBe(0);
    expect(balance?.openingValue).toBe(0);
  });

  it("is a no-op when no AUTO_WEEKLY bookings exist for the week", async () => {
    const result = await removeWeekClosingBookings(db.prisma, weekId);
    expect(result.bookingsRemoved).toBe(0);
  });

  it("preserves manual bookings that fall inside the week's date range", async () => {
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

    // Manual booking in the middle of the same week
    const wedDate = parseIsoDate(weekDays[2])!;
    const manual = await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date: wedDate,
      value: 60,
      bookingType: "MANUAL_CREDIT",
      comment: "Bonus",
      createdByUserId: adminId,
    });

    const result = await removeWeekClosingBookings(db.prisma, weekId);
    expect(result.bookingsRemoved).toBe(1);

    const remaining = await db.prisma.booking.findMany({
      where: { employeeId: employee.id },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(manual.bookingId);
    expect(remaining[0].bookingType).toBe("MANUAL_CREDIT");

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    // Only the manual +60 remains
    expect(balance?.currentValue).toBe(60);
  });

  it("recalc → reopen → recalc round-trips to the same balance", async () => {
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
    await removeWeekClosingBookings(db.prisma, weekId);
    await recalcWeekClose(db.prisma, weekId, adminId);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(180);
    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].value).toBe(180);
  });

  it("is a no-op when the weekId does not exist", async () => {
    const result = await removeWeekClosingBookings(db.prisma, "missing-week");
    expect(result.bookingsRemoved).toBe(0);
  });

  it("does not affect AUTO_WEEKLY bookings of an adjacent (untouched) week", async () => {
    const otherWeekId = await seedDraftWeek(db.prisma, YEAR, KW + 1);
    const otherWeekDays = isoWeekDays(YEAR, KW + 1).map((d) => d.iso);

    const employee = await seedEmployee(db.prisma, { locationId });

    for (let i = 0; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        plannedMinutes: 540,
      });
      await seedShiftEntry(db.prisma, {
        weekId: otherWeekId,
        employeeId: employee.id,
        isoDate: otherWeekDays[i],
        plannedMinutes: 540,
      });
    }

    await recalcWeekClose(db.prisma, weekId, adminId);
    await recalcWeekClose(db.prisma, otherWeekId, adminId);

    await removeWeekClosingBookings(db.prisma, weekId);

    const remaining = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(remaining).toHaveLength(1);
    // Only the still-closed week's booking remains
    expect(remaining[0].comment).toBe(`KW ${KW + 1}/${YEAR}`);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(180);
  });
});
