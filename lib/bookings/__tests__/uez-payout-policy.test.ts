import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedAdmin, seedEmployee, seedLocation } from "@/lib/test/fixtures";
import {
  applyUezPayout,
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

function baseInput(employeeId: string, tenantId: string) {
  return {
    employeeId,
    tenantId,
    date: parseIsoDate(`${YEAR}-03-15`)!,
    minutes: 60,
    comment: "abc",
    createdByUserId: adminId,
  };
}

describe("applyUezPayout — UezPayoutPolicy", () => {
  describe("ALLOWED", () => {
    it("erlaubt Kurzkommentar wie bisher", async () => {
      const employee = await seedEmployee(db.prisma, { locationId });
      await seedUezBalance(db.prisma, employee.id, employee.tenantId, 120);

      const result = await applyUezPayout(db.prisma, {
        ...baseInput(employee.id, employee.tenantId),
        policy: "ALLOWED",
      });
      expect(result.signedValue).toBe(-60);
    });

    it("ohne policy-Prop verhält sich wie ALLOWED", async () => {
      const employee = await seedEmployee(db.prisma, { locationId });
      await seedUezBalance(db.prisma, employee.id, employee.tenantId, 120);

      const result = await applyUezPayout(db.prisma, {
        employeeId: employee.id,
        tenantId: employee.tenantId,
        date: parseIsoDate(`${YEAR}-03-15`)!,
        minutes: 60,
        comment: "xyz",
        createdByUserId: adminId,
      });
      expect(result.signedValue).toBe(-60);
    });

    it("verwirft weiterhin Überziehung des Saldos", async () => {
      const employee = await seedEmployee(db.prisma, { locationId });
      await seedUezBalance(db.prisma, employee.id, employee.tenantId, 30);

      await expect(
        applyUezPayout(db.prisma, {
          ...baseInput(employee.id, employee.tenantId),
          policy: "ALLOWED",
          minutes: 60,
        }),
      ).rejects.toMatchObject({
        name: "UezPayoutError",
        code: "INSUFFICIENT_BALANCE",
      });
    });
  });

  describe("BLOCKED", () => {
    it("blockiert jede Auszahlung mit POLICY_BLOCKED", async () => {
      const employee = await seedEmployee(db.prisma, { locationId });
      await seedUezBalance(db.prisma, employee.id, employee.tenantId, 500);

      await expect(
        applyUezPayout(db.prisma, {
          ...baseInput(employee.id, employee.tenantId),
          policy: "BLOCKED",
          comment: "Dies sollte keine Rolle spielen ",
        }),
      ).rejects.toMatchObject({
        name: "UezPayoutError",
        code: "POLICY_BLOCKED",
      });

      const payouts = await db.prisma.booking.findMany({
        where: {
          employeeId: employee.id,
          bookingType: "UEZ_PAYOUT",
        },
      });
      expect(payouts).toHaveLength(0);
    });

    it("verwirft auch bei sehr langem Kommentar", async () => {
      const employee = await seedEmployee(db.prisma, { locationId });
      await seedUezBalance(db.prisma, employee.id, employee.tenantId, 120);

      await expect(
        applyUezPayout(db.prisma, {
          employeeId: employee.id,
          tenantId: employee.tenantId,
          date: parseIsoDate(`${YEAR}-03-15`)!,
          minutes: 30,
          comment: "x".repeat(80),
          createdByUserId: adminId,
          policy: "BLOCKED",
        }),
      ).rejects.toMatchObject({
        code: "POLICY_BLOCKED",
      });
    });
  });

  describe("WITH_NOTICE", () => {
    it("verwirft Kurzkommentar ohne Hinweistext mit POLICY_NOTICE_INCOMPLETE", async () => {
      const employee = await seedEmployee(db.prisma, { locationId });
      await seedUezBalance(db.prisma, employee.id, employee.tenantId, 200);

      await expect(
        applyUezPayout(db.prisma, {
          employeeId: employee.id,
          tenantId: employee.tenantId,
          date: parseIsoDate(`${YEAR}-03-15`)!,
          minutes: 40,
          comment: "nur drei",
          createdByUserId: adminId,
          policy: "WITH_NOTICE",
        }),
      ).rejects.toMatchObject({
        name: "UezPayoutError",
        code: "POLICY_NOTICE_INCOMPLETE",
      });
    });

    it("erlaubt mit Kommentar ab 20 Zeichen ohne Hinweis", async () => {
      const employee = await seedEmployee(db.prisma, { locationId });
      await seedUezBalance(db.prisma, employee.id, employee.tenantId, 200);

      const result = await applyUezPayout(db.prisma, {
        employeeId: employee.id,
        tenantId: employee.tenantId,
        date: parseIsoDate(`${YEAR}-03-15`)!,
        minutes: 40,
        comment: "Auszahlungsgrund mit genug Buchstaben",
        createdByUserId: adminId,
        policy: "WITH_NOTICE",
      });
      expect(result.signedValue).toBe(-40);
    });

    it("erlaubt kurzen Kommentar mit Hinweistext", async () => {
      const employee = await seedEmployee(db.prisma, { locationId });
      await seedUezBalance(db.prisma, employee.id, employee.tenantId, 200);

      const result = await applyUezPayout(db.prisma, {
        employeeId: employee.id,
        tenantId: employee.tenantId,
        date: parseIsoDate(`${YEAR}-03-15`)!,
        minutes: 40,
        comment: "abc",
        createdByUserId: adminId,
        policy: "WITH_NOTICE",
        acknowledgedNoticeText: "Informiert am 15. März per Brief.",
      });
      expect(result.signedValue).toBe(-40);
    });

    it("verwirft Untersaldozahlung ebenfalls", async () => {
      const employee = await seedEmployee(db.prisma, { locationId });
      await seedUezBalance(db.prisma, employee.id, employee.tenantId, 20);

      await expect(
        applyUezPayout(db.prisma, {
          employeeId: employee.id,
          tenantId: employee.tenantId,
          date: parseIsoDate(`${YEAR}-03-15`)!,
          minutes: 999,
          comment: "Dies ist ein ausreichend langes Kommentar.",
          createdByUserId: adminId,
          policy: "WITH_NOTICE",
        }),
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_BALANCE",
      });
    });
  });
});
