import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import {
  seedAdmin,
  seedDraftWeek,
  seedEmployee,
  seedHoliday,
  seedLocation,
  seedShiftEntry,
  seedAbsenceEntry,
} from "@/lib/test/fixtures";
import { recalcWeekClose } from "@/lib/bookings/core";
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

describe("recalcWeekClose", () => {
  it("creates a ZEITSALDO booking for an overtime week below the HAZ cap", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    for (let i = 0; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        plannedMinutes: 540,
      });
    }

    const result = await recalcWeekClose(db.prisma, weekId, adminId);

    expect(result.employeesAffected).toBe(1);
    expect(result.bookingsCreated).toBe(1);

    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].accountType).toBe("ZEITSALDO");
    expect(bookings[0].value).toBe(180);
    expect(bookings[0].comment).toBe(`KW ${KW}/${YEAR}`);

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
    expect(balance?.openingValue).toBe(0);
  });

  it("creates a FERIEN debit (-5) for a full vacation week with 0 delta", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    for (let i = 0; i < 5; i++) {
      await seedAbsenceEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        absenceType: "VACATION",
      });
    }

    await recalcWeekClose(db.prisma, weekId, adminId);

    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].accountType).toBe("FERIEN");
    expect(bookings[0].value).toBe(-5);

    const ferien = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "FERIEN",
          year: YEAR,
        },
      },
    });
    expect(ferien?.openingValue).toBe(25);
    expect(ferien?.currentValue).toBe(20);
  });

  it("creates a parental/care leave debit on its dedicated account", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    for (let i = 0; i < 5; i++) {
      await seedAbsenceEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        absenceType: "PARENTAL_CARE",
      });
    }

    await recalcWeekClose(db.prisma, weekId, adminId);

    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].accountType).toBe("PARENTAL_CARE");
    expect(bookings[0].value).toBe(-5);

    const parentalCare = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "PARENTAL_CARE",
          year: YEAR,
        },
      },
    });
    expect(parentalCare?.openingValue).toBe(0);
    expect(parentalCare?.currentValue).toBe(-5);
  });

  it("does not debit Ferien for a vacation day that falls on a holiday", async () => {
    await seedHoliday(db.prisma, locationId, weekDays[3], "Test-Feiertag");
    const employee = await seedEmployee(db.prisma, { locationId });
    for (let i = 0; i < 5; i++) {
      await seedAbsenceEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        absenceType: "VACATION",
      });
    }

    await recalcWeekClose(db.prisma, weekId, adminId);

    const ferien = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "FERIEN",
          year: YEAR,
        },
      },
    });
    // 4 vacation days debited (Thu was overridden to HOLIDAY)
    expect(ferien?.currentValue).toBe(21);

    const ferienBookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, accountType: "FERIEN" },
    });
    expect(ferienBookings).toHaveLength(1);
    expect(ferienBookings[0].value).toBe(-4);
  });

  it("creates a UEZ booking when weekly work exceeds the HAZ cap", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    for (let i = 0; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        plannedMinutes: 600,
      });
    }

    await recalcWeekClose(db.prisma, weekId, adminId);

    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
      orderBy: { accountType: "asc" },
    });
    expect(bookings).toHaveLength(2);
    const byType = Object.fromEntries(
      bookings.map((b) => [b.accountType, b.value]),
    );
    // Zeitsaldo is capped at HAZ: min(3000,2700)-2520 = +180
    expect(byType.ZEITSALDO).toBe(180);
    // Work 3000 > HAZ 2700 → UEZ +300
    expect(byType.UEZ).toBe(300);
  });

  it("FREE_REQUESTED reduces Zeitsaldo by exactly one -Tagessoll per day, no AUTO_WEEKLY wash", async () => {
    // Repro for Befund #13: FREE_REQUESTED-Tag must pull -Tagessoll from
    // Zeitsaldo cleanly. Previously the +/- pair washed on the AUTO_WEEKLY
    // booking; now there is one FREE_REQUESTED booking per FREE_REQUESTED
    // day and the AUTO_WEEKLY booking excludes that contribution entirely.
    const employee = await seedEmployee(db.prisma, {
      locationId,
      weeklyTargetMinutes: 2400,
      hazMinutesPerWeek: 2700,
    });
    // Mon–Thu: 480 min WORK each (= Tagessoll) → work delta = 0
    for (let i = 0; i < 4; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        plannedMinutes: 480,
      });
    }
    // Friday: FREE_REQUESTED → soll 480, ist 0 → -480 contribution
    await seedAbsenceEntry(db.prisma, {
      weekId,
      employeeId: employee.id,
      isoDate: weekDays[4],
      absenceType: "FREE_REQUESTED",
    });

    const result = await recalcWeekClose(db.prisma, weekId, adminId);
    expect(result.bookingsCreated).toBe(1);

    const zeitsaldoBookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, accountType: "ZEITSALDO" },
    });
    expect(zeitsaldoBookings).toHaveLength(1);
    expect(zeitsaldoBookings[0].bookingType).toBe("FREE_REQUESTED");
    expect(zeitsaldoBookings[0].value).toBe(-480);
    expect(zeitsaldoBookings[0].comment).toBe(
      `Frei verlangt KW ${KW}/${YEAR}`,
    );

    const autoWeekly = await db.prisma.booking.findMany({
      where: {
        employeeId: employee.id,
        accountType: "ZEITSALDO",
        bookingType: "AUTO_WEEKLY",
      },
    });
    expect(autoWeekly).toHaveLength(0);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(-480);
  });

  it("creates one FREE_REQUESTED booking per FREE_REQUESTED day", async () => {
    const employee = await seedEmployee(db.prisma, {
      locationId,
      weeklyTargetMinutes: 2400,
      hazMinutesPerWeek: 2700,
    });
    // Mon + Tue FREE_REQUESTED, Wed–Fri 480 work each
    await seedAbsenceEntry(db.prisma, {
      weekId,
      employeeId: employee.id,
      isoDate: weekDays[0],
      absenceType: "FREE_REQUESTED",
    });
    await seedAbsenceEntry(db.prisma, {
      weekId,
      employeeId: employee.id,
      isoDate: weekDays[1],
      absenceType: "FREE_REQUESTED",
    });
    for (let i = 2; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        plannedMinutes: 480,
      });
    }

    await recalcWeekClose(db.prisma, weekId, adminId);

    const freeRequestedBookings = await db.prisma.booking.findMany({
      where: {
        employeeId: employee.id,
        bookingType: "FREE_REQUESTED",
      },
    });
    expect(freeRequestedBookings).toHaveLength(2);
    for (const b of freeRequestedBookings) {
      expect(b.value).toBe(-480);
      expect(b.accountType).toBe("ZEITSALDO");
      expect(b.comment).toBe(`Frei verlangt KW ${KW}/${YEAR}`);
    }

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(-960);
  });

  it("creates a dedicated FREE_REQUESTED booking on ZEITSALDO", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedAbsenceEntry(db.prisma, {
      weekId,
      employeeId: employee.id,
      isoDate: weekDays[0],
      absenceType: "FREE_REQUESTED",
    });
    for (let i = 1; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        plannedMinutes: 504,
      });
    }

    const result = await recalcWeekClose(db.prisma, weekId, adminId);
    expect(result.bookingsCreated).toBe(1);

    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id },
      orderBy: { bookingType: "asc" },
    });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].bookingType).toBe("FREE_REQUESTED");
    expect(bookings[0].accountType).toBe("ZEITSALDO");
    expect(bookings[0].value).toBe(-504);
    expect(bookings[0].comment).toBe(`Frei verlangt KW ${KW}/${YEAR}`);

    const balance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(balance?.currentValue).toBe(-504);
  });

  it("is idempotent: re-running yields identical balances and no duplicate bookings", async () => {
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
    const firstBookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });

    await recalcWeekClose(db.prisma, weekId, adminId);
    const secondBookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });

    expect(secondBookings).toHaveLength(firstBookings.length);
    expect(firstBookings[0].id).not.toBe(secondBookings[0].id);

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

  it("re-recalc reflects plan changes (booking is updated, not stacked)", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    // Mon–Thu 500 min, Fri 540 min → work 2540 (below HAZ 2700), delta +20
    for (let i = 0; i < 4; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: employee.id,
        isoDate: weekDays[i],
        plannedMinutes: 500,
      });
    }
    await seedShiftEntry(db.prisma, {
      weekId,
      employeeId: employee.id,
      isoDate: weekDays[4],
      plannedMinutes: 540,
    });

    await recalcWeekClose(db.prisma, weekId, adminId);
    const firstBalance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(firstBalance?.currentValue).toBe(20);

    // Bump Friday 540 → 600 (work 2600, still below HAZ; delta +80)
    const friEntry = await db.prisma.planEntry.findFirst({
      where: { weekId, employeeId: employee.id, plannedMinutes: 540 },
    });
    expect(friEntry).not.toBeNull();
    await db.prisma.planEntry.update({
      where: { id: friEntry!.id },
      data: { plannedMinutes: 600 },
    });

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
    expect(balance?.currentValue).toBe(80);
    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: employee.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].value).toBe(80);
  });

  it("scopes per employee — overtime for one, vacation for the other", async () => {
    const overtime = await seedEmployee(db.prisma, {
      locationId,
      firstName: "Otto",
      lastName: "Overtime",
    });
    const vacationer = await seedEmployee(db.prisma, {
      locationId,
      firstName: "Viki",
      lastName: "Vacation",
    });

    for (let i = 0; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: overtime.id,
        isoDate: weekDays[i],
        plannedMinutes: 540,
      });
      await seedAbsenceEntry(db.prisma, {
        weekId,
        employeeId: vacationer.id,
        isoDate: weekDays[i],
        absenceType: "VACATION",
      });
    }

    const result = await recalcWeekClose(db.prisma, weekId, adminId);
    expect(result.employeesAffected).toBe(2);
    expect(result.bookingsCreated).toBe(2);

    const overtimeBalance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: overtime.id,
          accountType: "ZEITSALDO",
          year: YEAR,
        },
      },
    });
    expect(overtimeBalance?.currentValue).toBe(180);

    const vacationerFerien = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: vacationer.id,
          accountType: "FERIEN",
          year: YEAR,
        },
      },
    });
    expect(vacationerFerien?.currentValue).toBe(20);
  });

  it("is a no-op when the weekId does not exist", async () => {
    const result = await recalcWeekClose(
      db.prisma,
      "non-existent-week-id",
      adminId,
    );
    expect(result.employeesAffected).toBe(0);
    expect(result.bookingsCreated).toBe(0);
  });

  it("ignores inactive employees", async () => {
    const inactive = await seedEmployee(db.prisma, {
      locationId,
      isActive: false,
    });
    for (let i = 0; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: inactive.id,
        isoDate: weekDays[i],
        plannedMinutes: 540,
      });
    }

    const result = await recalcWeekClose(db.prisma, weekId, adminId);
    expect(result.employeesAffected).toBe(0);
    expect(result.bookingsCreated).toBe(0);

    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: inactive.id },
    });
    expect(bookings).toHaveLength(0);
  });

  it("skips employees whose entryDate is after the closed week", async () => {
    const futureEntry = await seedEmployee(db.prisma, {
      locationId,
      entryDate: new Date(2026, 11, 1),
    });
    for (let i = 0; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: futureEntry.id,
        isoDate: weekDays[i],
        plannedMinutes: 540,
      });
    }

    const result = await recalcWeekClose(db.prisma, weekId, adminId);
    expect(result.employeesAffected).toBe(0);
    expect(result.bookingsCreated).toBe(0);

    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: futureEntry.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(bookings).toHaveLength(0);
  });

  it("skips employees whose exitDate is before the closed week end", async () => {
    const alreadyExited = await seedEmployee(db.prisma, {
      locationId,
      exitDate: new Date(2026, 0, 31),
    });
    for (let i = 0; i < 5; i++) {
      await seedShiftEntry(db.prisma, {
        weekId,
        employeeId: alreadyExited.id,
        isoDate: weekDays[i],
        plannedMinutes: 540,
      });
    }

    const result = await recalcWeekClose(db.prisma, weekId, adminId);
    expect(result.employeesAffected).toBe(0);
    expect(result.bookingsCreated).toBe(0);

    const bookings = await db.prisma.booking.findMany({
      where: { employeeId: alreadyExited.id, bookingType: "AUTO_WEEKLY" },
    });
    expect(bookings).toHaveLength(0);
  });

  it("includes employees when entryDate or exitDate equals the week close date", async () => {
    const boundaryEntry = await seedEmployee(db.prisma, {
      locationId,
      entryDate: parseIsoDate(weekDays[6])!,
    });
    const boundaryExit = await seedEmployee(db.prisma, {
      locationId,
      exitDate: parseIsoDate(weekDays[6])!,
    });

    for (const employeeId of [boundaryEntry.id, boundaryExit.id]) {
      for (let i = 0; i < 5; i++) {
        await seedShiftEntry(db.prisma, {
          weekId,
          employeeId,
          isoDate: weekDays[i],
          plannedMinutes: 540,
        });
      }
    }

    const result = await recalcWeekClose(db.prisma, weekId, adminId);
    expect(result.employeesAffected).toBe(2);
    expect(result.bookingsCreated).toBe(2);
  });

  it("creates an OPEN ERT case for holiday work above 5 hours", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedHoliday(db.prisma, locationId, weekDays[0], "Feiertag");
    await seedShiftEntry(db.prisma, {
      weekId,
      employeeId: employee.id,
      isoDate: weekDays[0],
      plannedMinutes: 360,
    });

    await recalcWeekClose(db.prisma, weekId, adminId);

    const ertCases = await db.prisma.ertCase.findMany({
      where: { employeeId: employee.id },
    });
    expect(ertCases).toHaveLength(1);
    expect(["OPEN", "FULFILLED"]).toContain(ertCases[0].status);
    expect(ertCases[0].holidayWorkMinutes).toBe(360);
  });

  it("creates Sunday/holiday compensation booking for holiday work up to 5 hours", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedHoliday(db.prisma, locationId, weekDays[0], "Feiertag");
    await seedShiftEntry(db.prisma, {
      weekId,
      employeeId: employee.id,
      isoDate: weekDays[0],
      plannedMinutes: 300,
    });

    await recalcWeekClose(db.prisma, weekId, adminId);

    const compensationBooking = await db.prisma.booking.findFirst({
      where: {
        employeeId: employee.id,
        bookingType: "AUTO_WEEKLY",
        accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
      },
    });
    expect(compensationBooking).not.toBeNull();
    expect(compensationBooking?.value).toBe(300);

    const compensationBalance = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          year: YEAR,
        },
      },
    });
    expect(compensationBalance?.openingValue).toBe(0);
    expect(compensationBalance?.currentValue).toBe(300);
    expect(compensationBalance?.unit).toBe("MINUTES");
  });
});
