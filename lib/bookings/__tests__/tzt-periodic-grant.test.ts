import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedAdmin, seedEmployee, seedLocation } from "@/lib/test/fixtures";
import { applyTztPeriodicGrant } from "@/lib/bookings/core";
import { isoDateString, parseIsoDate } from "@/lib/time/week";

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

describe("applyTztPeriodicGrant", () => {
  it("wendet keine Gutschrift an, wenn die Periode noch nicht erreicht ist", async () => {
    await seedEmployee(db.prisma, {
      locationId,
      entryDate: parseIsoDate("2026-01-01")!,
      tztPeriodicQuotaDays: 3,
      tztPeriodMonths: 3,
      tztLastGrantedAt: parseIsoDate("2026-03-01")!,
    });

    const asOf = parseIsoDate("2026-04-15")!;
    const result = await applyTztPeriodicGrant(db.prisma, asOf);

    expect(result.grantsApplied).toBe(0);
    expect(result.grants).toHaveLength(0);

    const bookings = await db.prisma.booking.findMany({
      where: { createdByUserId: adminId, bookingType: "MANUAL_CREDIT" },
    });
    expect(bookings.filter((b) => b.accountType === "TZT")).toHaveLength(0);
  });

  it("bucht MANUAL_CREDIT TZT wenn die Periode fällig ist", async () => {
    const emp = await seedEmployee(db.prisma, {
      locationId,
      entryDate: parseIsoDate("2026-01-01")!,
      tztPeriodicQuotaDays: 2.5,
      tztPeriodMonths: 1,
      tztLastGrantedAt: null,
    });

    const asOf = parseIsoDate("2026-02-15")!;
    const result = await applyTztPeriodicGrant(db.prisma, asOf);

    expect(result.grantsApplied).toBe(1);
    expect(result.grants[0]?.daysGranted).toBe(2.5);
    expect(result.grants[0]?.periodsGranted).toBe(1);

    const booking = await db.prisma.booking.findFirst({
      where: {
        employeeId: emp.id,
        accountType: "TZT",
        bookingType: "MANUAL_CREDIT",
      },
    });
    expect(booking?.value).toBe(2.5);

    const refreshed = await db.prisma.employee.findUniqueOrThrow({
      where: { id: emp.id },
    });
    expect(isoDateString(refreshed.tztLastGrantedAt!)).toBe("2026-02-01");

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: emp.id,
          accountType: "TZT",
          year: 2026,
        },
      },
    });
    expect(balance?.currentValue).toBe(2.5);
  });

  it("ist idempotent bei zweimaligem Aufruf mit demselben Stichtag", async () => {
    await seedEmployee(db.prisma, {
      locationId,
      entryDate: parseIsoDate("2026-01-01")!,
      tztPeriodicQuotaDays: 3,
      tztPeriodMonths: 1,
      tztLastGrantedAt: null,
    });

    const asOf = parseIsoDate("2026-02-10")!;
    const first = await applyTztPeriodicGrant(db.prisma, asOf);
    expect(first.grantsApplied).toBe(1);

    const second = await applyTztPeriodicGrant(db.prisma, asOf);
    expect(second.grantsApplied).toBe(0);

    const tztCredits = await db.prisma.booking.count({
      where: { bookingType: "MANUAL_CREDIT", accountType: "TZT" },
    });
    expect(tztCredits).toBe(1);
  });
});
