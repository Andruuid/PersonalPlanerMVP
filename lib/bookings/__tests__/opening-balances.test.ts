import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedAdmin, seedEmployee, seedLocation } from "@/lib/test/fixtures";
import {
  applyEmployeeOpeningBalances,
  applyManualBooking,
} from "@/lib/bookings/core";
import { parseIsoDate } from "@/lib/time/week";

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

describe("applyEmployeeOpeningBalances", () => {
  it("creates OPENING bookings and updates balances for non-zero amounts", async () => {
    const employee = await seedEmployee(db.prisma, {
      locationId,
      vacationDaysPerYear: 25,
    });
    const entryDate = parseIsoDate("2026-04-01")!;

    const created = await db.prisma.$transaction(async (tx) =>
      applyEmployeeOpeningBalances(tx, {
        employeeId: employee.id,
        tenantId: employee.tenantId,
        vacationDaysPerYear: 25,
        entryDate,
        createdByUserId: adminId,
        openings: {
          ZEITSALDO: 120,
          FERIEN: 2.5,
          TZT: 1,
        },
      }),
    );

    expect(created).toBe(3);

    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "OPENING" },
      orderBy: { accountType: "asc" },
    });
    expect(bookings).toHaveLength(3);
    expect(
      bookings.every((b) => b.comment === "Anfangsbestand (Stammdaten)"),
    ).toBe(true);

    const zs = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: 2026,
        },
      },
    });
    expect(zs?.currentValue).toBe(120);

    const ferien = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "FERIEN",
          year: 2026,
        },
      },
    });
    // OPENING bookings are folded into openingValue (allowance + opening
    // delta), and excluded from the recompute sum to avoid double counting.
    expect(ferien?.openingValue).toBe(27.5);
    expect(ferien?.currentValue).toBe(27.5);

    const tzt = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "TZT",
          year: 2026,
        },
      },
    });
    expect(tzt?.currentValue).toBe(1);
  });

  it("creates OPENING for PARENTAL_CARE in days", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const entryDate = parseIsoDate("2026-06-01")!;

    const created = await db.prisma.$transaction(async (tx) =>
      applyEmployeeOpeningBalances(tx, {
        employeeId: employee.id,
        tenantId: employee.tenantId,
        vacationDaysPerYear: 25,
        entryDate,
        createdByUserId: adminId,
        openings: { PARENTAL_CARE: 5 },
      }),
    );

    expect(created).toBe(1);

    const booking = await db.prisma.booking.findFirst({
      where: {
        employeeId: employee.id,
        accountType: "PARENTAL_CARE",
        bookingType: "OPENING",
      },
    });
    expect(booking?.value).toBe(5);

    const row = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "PARENTAL_CARE",
          year: 2026,
        },
      },
    });
    expect(row?.openingValue).toBe(5);
    expect(row?.currentValue).toBe(5);
  });

  it("skips all-zero openings", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const entryDate = parseIsoDate("2026-01-10")!;

    const created = await db.prisma.$transaction(async (tx) =>
      applyEmployeeOpeningBalances(tx, {
        employeeId: employee.id,
        tenantId: employee.tenantId,
        vacationDaysPerYear: 25,
        entryDate,
        createdByUserId: adminId,
        openings: {},
      }),
    );

    expect(created).toBe(0);
    const n = await db.prisma.booking.count({
      where: { employeeId: employee.id },
    });
    expect(n).toBe(0);
  });

  it("applyManualBooking with OPENING type updates openingValue and currentValue correctly when other bookings already exist", async () => {
    const employee = await seedEmployee(db.prisma, {
      locationId,
      vacationDaysPerYear: 25,
    });
    const date = parseIsoDate("2026-03-15")!;

    // First post a regular MANUAL_CREDIT so the year already carries
    // bookings before the retroactive OPENING is applied.
    await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: 100,
      bookingType: "MANUAL_CREDIT",
      comment: "Bonus",
      createdByUserId: adminId,
    });

    const beforeOpening = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: 2026,
        },
      },
    });
    expect(beforeOpening?.openingValue).toBe(0);
    expect(beforeOpening?.currentValue).toBe(100);

    // Retroactively post the Anfangsbestand: opening should shift by +50
    // and current by +50, regardless of existing bookings.
    const opening = await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: 50,
      bookingType: "OPENING",
      comment: "Anfangsbestand nachgereicht",
      createdByUserId: adminId,
    });
    expect(opening.signedValue).toBe(50);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: 2026,
        },
      },
    });
    expect(balance?.openingValue).toBe(50);
    expect(balance?.currentValue).toBe(150);

    // Negative OPENING is also accepted as-is (no sign coercion).
    const negative = await applyManualBooking(db.prisma, {
      employeeId: employee.id,
      accountType: "ZEITSALDO",
      date,
      value: -20,
      bookingType: "OPENING",
      comment: "Anfangsbestand korrigiert",
      createdByUserId: adminId,
    });
    expect(negative.signedValue).toBe(-20);

    const afterNegative = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: 2026,
        },
      },
    });
    expect(afterNegative?.openingValue).toBe(30);
    expect(afterNegative?.currentValue).toBe(130);

    const openings = await db.prisma.booking.findMany({
      where: {
        employeeId: employee.id,
        accountType: "ZEITSALDO",
        bookingType: "OPENING",
      },
      orderBy: { createdAt: "asc" },
    });
    expect(openings.map((b) => b.value)).toEqual([50, -20]);
  });
});
