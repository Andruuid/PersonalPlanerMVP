import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedEmployee, seedLocation } from "@/lib/test/fixtures";
import { createPrivacyRequest, decidePrivacyRequest } from "../core";

let db: TestDb;

beforeAll(async () => {
  db = makeTestDb();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.reset();
});

describe("privacy core", () => {
  it("creates a privacy request in OPEN state", async () => {
    const locationId = await seedLocation(db.prisma);
    const employee = await seedEmployee(db.prisma, { locationId });

    const request = await createPrivacyRequest(db.prisma, {
      tenantId: employee.tenantId,
      employeeId: employee.id,
      type: "ERASURE",
      note: "Bitte löschen",
    });

    expect(request.status).toBe("OPEN");
    expect(request.type).toBe("ERASURE");
    expect(request.note).toBe("Bitte löschen");
  });

  it("decides an existing privacy request", async () => {
    const locationId = await seedLocation(db.prisma);
    const employee = await seedEmployee(db.prisma, { locationId });
    const decider = await seedEmployee(db.prisma, { locationId });

    const request = await createPrivacyRequest(db.prisma, {
      tenantId: employee.tenantId,
      employeeId: employee.id,
      type: "EXPORT",
    });

    const decided = await decidePrivacyRequest(db.prisma, {
      tenantId: employee.tenantId,
      requestId: request.id,
      status: "APPROVED",
      decidedById: decider.userId,
      note: "Freigegeben",
    });

    expect(decided).not.toBeNull();
    expect(decided?.before.status).toBe("OPEN");
    expect(decided?.after.status).toBe("APPROVED");
    expect(decided?.after.decidedById).toBe(decider.userId);
  });
});
