import { addDays, format } from "date-fns";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import {
  seedAdmin,
  seedDraftWeek,
  seedEmployee,
  seedHoliday,
  seedLocation,
  seedShiftEntry,
} from "@/lib/test/fixtures";
import { applyCompensationRedemption, recalcWeekClose } from "@/lib/bookings/core";
import {
  isoDateString,
  isoWeekDays,
  parseIsoDate,
  shiftWeek,
  type IsoWeek,
} from "@/lib/time/week";

const YEAR = 2026;
const KW = 10;

let db: TestDb;
let adminId: string;
let locationId: string;
let weekIdKw10: string;
let weekDaysKw10: string[];

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
  weekIdKw10 = await seedDraftWeek(db.prisma, YEAR, KW);
  weekDaysKw10 = isoWeekDays(YEAR, KW).map((d) => d.iso);
});

function advanceWeekRepeatedly(from: IsoWeek, steps: number): IsoWeek {
  let cursor = from;
  for (let s = 0; s < steps; s++) {
    cursor = shiftWeek(cursor, 1);
  }
  return cursor;
}

describe("upsertAndAdvanceCompensationCases via recalcWeekClose", () => {
  it("creates CompensationCase OPEN for HOLIDAY_WORK up to 5h after week close", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedHoliday(db.prisma, locationId, weekDaysKw10[0], "Feiertag");
    await seedShiftEntry(db.prisma, {
      weekId: weekIdKw10,
      employeeId: employee.id,
      isoDate: weekDaysKw10[0],
      plannedMinutes: 240,
    });

    await recalcWeekClose(db.prisma, weekIdKw10, adminId);

    const cases = await db.prisma.compensationCase.findMany({
      where: { employeeId: employee.id },
    });
    expect(cases).toHaveLength(1);
    expect(cases[0].status).toBe("OPEN");
    expect(cases[0].holidayWorkMinutes).toBe(240);

    const trig = parseIsoDate(weekDaysKw10[0])!;
    expect(isoDateString(cases[0].dueAt)).toBe(isoDateString(addDays(trig, 180)));
    expect(await db.prisma.ertCase.findMany({ where: { employeeId: employee.id } })).toHaveLength(0);
  });

  it("sets REDEEMED when COMPENSATION_REDEMPTION sums to holidayWorkMinutes before dueAt", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedHoliday(db.prisma, locationId, weekDaysKw10[0], "Feiertag");
    await seedShiftEntry(db.prisma, {
      weekId: weekIdKw10,
      employeeId: employee.id,
      isoDate: weekDaysKw10[0],
      plannedMinutes: 240,
    });

    await recalcWeekClose(db.prisma, weekIdKw10, adminId);

    await applyCompensationRedemption(db.prisma, {
      employeeId: employee.id,
      tenantId: employee.tenantId,
      date: parseIsoDate(weekDaysKw10[2])!,
      minutes: 240,
      comment: "Bezug Kompensation",
      createdByUserId: adminId,
    });

    const next = advanceWeekRepeatedly({ year: YEAR, weekNumber: KW }, 1);

    const nextDays = isoWeekDays(next.year, next.weekNumber);
    const weekIdLater = await seedDraftWeek(db.prisma, next.year, next.weekNumber);
    await seedShiftEntry(db.prisma, {
      weekId: weekIdLater,
      employeeId: employee.id,
      isoDate: nextDays[0].iso,
      plannedMinutes: 480,
    });

    await recalcWeekClose(db.prisma, weekIdLater, adminId);

    const c = await db.prisma.compensationCase.findUnique({
      where: {
        employeeId_triggerDate: {
          employeeId: employee.id,
          triggerDate: parseIsoDate(weekDaysKw10[0])!,
        },
      },
    });
    expect(c?.status).toBe("REDEEMED");
    expect(c?.redeemedAt).not.toBeNull();
    const redeemedSunday = nextDays[6].date;
    expect(format(c!.redeemedAt!, "yyyy-MM-dd")).toBe(format(redeemedSunday, "yyyy-MM-dd"));
  });

  it("sets EXPIRED when dueAt has passed without sufficient redemption", async () => {
    const employee = await seedEmployee(db.prisma, { locationId });
    await seedHoliday(db.prisma, locationId, weekDaysKw10[0], "Feiertag");
    await seedShiftEntry(db.prisma, {
      weekId: weekIdKw10,
      employeeId: employee.id,
      isoDate: weekDaysKw10[0],
      plannedMinutes: 240,
    });

    await recalcWeekClose(db.prisma, weekIdKw10, adminId);

    const trigger = parseIsoDate(weekDaysKw10[0])!;
    const due = addDays(trigger, 180);

    const firstSunday = isoWeekDays(YEAR, KW)[6].date;
    const balanceYear0 = firstSunday.getFullYear();
    const balanceAfterCredit = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          year: balanceYear0,
        },
      },
    });
    const creditedMinutes = balanceAfterCredit?.currentValue ?? 0;
    expect(creditedMinutes).toBeGreaterThan(0);

    let probe: IsoWeek = shiftWeek({ year: YEAR, weekNumber: KW }, 1);
    let found: IsoWeek | null = null;
    for (let i = 0; i < 100; i++) {
      const sundayDate = isoWeekDays(probe.year, probe.weekNumber)[6].date;
      if (sundayDate > due) {
        found = probe;
        break;
      }
      probe = shiftWeek(probe, 1);
    }
    expect(found).not.toBeNull();

    const weekLateId = await seedDraftWeek(db.prisma, found!.year, found!.weekNumber);
    const wd = isoWeekDays(found!.year, found!.weekNumber);
    await seedShiftEntry(db.prisma, {
      weekId: weekLateId,
      employeeId: employee.id,
      isoDate: wd[2].iso,
      plannedMinutes: 480,
    });

    await recalcWeekClose(db.prisma, weekLateId, adminId);

    const c = await db.prisma.compensationCase.findUnique({
      where: {
        employeeId_triggerDate: {
          employeeId: employee.id,
          triggerDate: trigger,
        },
      },
    });
    expect(c?.status).toBe("EXPIRED");
    expect(c?.redeemedAt).toBeNull();

    const lateSunday = isoWeekDays(found!.year, found!.weekNumber)[6].date;
    const balanceYearLate = lateSunday.getFullYear();
    const balanceFinal = await db.prisma.accountBalance.findUnique({
      where: {
        employeeId_accountType_year: {
          employeeId: employee.id,
          accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
          year: balanceYearLate,
        },
      },
    });
    expect(balanceFinal?.currentValue ?? 0).toBe(0);

    const expiredBooking = await db.prisma.booking.findFirst({
      where: {
        employeeId: employee.id,
        bookingType: "COMPENSATION_EXPIRED",
        accountType: "SONNTAG_FEIERTAG_KOMPENSATION",
      },
    });
    expect(expiredBooking).not.toBeNull();
    expect(expiredBooking!.value).toBe(-creditedMinutes);
    expect(creditedMinutes).toBe(c!.holidayWorkMinutes);
  });
});
