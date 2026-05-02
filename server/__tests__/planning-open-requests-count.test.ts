import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedEmployee, seedLocation } from "@/lib/test/fixtures";

describe("planning open requests KPI count query", () => {
  let db: TestDb;

  beforeAll(() => {
    db = makeTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.reset();
  });

  it("uses count for total OPEN requests independent from list take limit", async () => {
    const locationId = await seedLocation(db.prisma, "Planning KPI Loc");
    const { id: employeeId, tenantId } = await seedEmployee(db.prisma, {
      locationId,
    });

    for (let i = 0; i < 25; i += 1) {
      await db.prisma.absenceRequest.create({
        data: {
          tenantId,
          employeeId,
          type: "VACATION",
          startDate: new Date(`2026-06-${String((i % 20) + 1).padStart(2, "0")}T00:00:00.000Z`),
          endDate: new Date(`2026-06-${String((i % 20) + 1).padStart(2, "0")}T00:00:00.000Z`),
          status: "OPEN",
          comment: "kpi count regression test",
        },
      });
    }

    // Simulate decisions that should no longer be counted as OPEN.
    await db.prisma.absenceRequest.create({
      data: {
        tenantId,
        employeeId,
        type: "VACATION",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-07-01T00:00:00.000Z"),
        status: "APPROVED",
      },
    });
    await db.prisma.absenceRequest.create({
      data: {
        tenantId,
        employeeId,
        type: "VACATION",
        startDate: new Date("2026-07-02T00:00:00.000Z"),
        endDate: new Date("2026-07-02T00:00:00.000Z"),
        status: "REJECTED",
      },
    });

    const [openRequests, openRequestsCount] = await Promise.all([
      db.prisma.absenceRequest.findMany({
        where: { tenantId, deletedAt: null, status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.prisma.absenceRequest.count({
        where: { tenantId, deletedAt: null, status: "OPEN" },
      }),
    ]);

    expect(openRequests).toHaveLength(20);
    expect(openRequests.every((r) => r.status === "OPEN")).toBe(true);
    expect(openRequestsCount).toBe(25);

    // Approve one OPEN request and verify the total count decreases.
    await db.prisma.absenceRequest.update({
      where: { id: openRequests[0]!.id },
      data: { status: "APPROVED", decidedAt: new Date() },
    });
    const nextOpenCount = await db.prisma.absenceRequest.count({
      where: { tenantId, deletedAt: null, status: "OPEN" },
    });
    expect(nextOpenCount).toBe(24);
  });
});
