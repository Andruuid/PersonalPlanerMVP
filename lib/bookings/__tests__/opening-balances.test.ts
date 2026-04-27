import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedAdmin, seedEmployee, seedLocation } from "@/lib/test/fixtures";
import { applyEmployeeOpeningBalances } from "@/lib/bookings/core";
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
    expect(ferien?.openingValue).toBe(25);
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

  it("skips all-zero openings", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    const entryDate = parseIsoDate("2026-01-10")!;

    const created = await db.prisma.$transaction(async (tx) =>
      applyEmployeeOpeningBalances(tx, {
        employeeId: employee.id,
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
});
