import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedAdmin } from "@/lib/test/fixtures";
import {
  computeAuditDiff,
  listAuditLogs,
  loadAuditFacets,
  writeAuditCore,
} from "@/lib/audit/core";

let db: TestDb;
let adminAId: string;
let adminBId: string;

beforeAll(async () => {
  db = makeTestDb();
});

afterAll(async () => {
  await db.close();
});

async function backdate(id: string, when: Date): Promise<void> {
  await db.prisma.auditLog.update({
    where: { id },
    data: { createdAt: when },
  });
}

beforeEach(async () => {
  await db.reset();
  const a = await seedAdmin(db.prisma, "alice@test.local");
  const b = await seedAdmin(db.prisma, "bob@test.local");
  adminAId = a.id;
  adminBId = b.id;

  await writeAuditCore(db.prisma, {
    userId: adminAId,
    action: "CREATE",
    entity: "Employee",
    entityId: "emp-1",
    newValue: { firstName: "Anna", pensum: 80 },
  });
  await writeAuditCore(db.prisma, {
    userId: adminAId,
    action: "UPDATE",
    entity: "Employee",
    entityId: "emp-1",
    oldValue: { firstName: "Anna", pensum: 80 },
    newValue: { firstName: "Anna", pensum: 100 },
    comment: "Aufstockung",
  });
  await writeAuditCore(db.prisma, {
    userId: adminBId,
    action: "DELETE",
    entity: "PlanEntry",
    entityId: "pe-9",
    oldValue: { date: "2026-03-15", plannedMinutes: 480 },
  });
  await writeAuditCore(db.prisma, {
    userId: adminBId,
    action: "PUBLISH",
    entity: "Week",
    entityId: "w-2026-12",
  });

  // Make timestamps deterministic for date-range tests.
  const all = await db.prisma.auditLog.findMany({
    orderBy: { createdAt: "asc" },
  });
  const stamps = [
    new Date(2026, 2, 10, 9, 0),
    new Date(2026, 2, 12, 14, 30),
    new Date(2026, 2, 15, 8, 15),
    new Date(2026, 2, 20, 17, 45),
  ];
  for (let i = 0; i < all.length; i++) {
    await backdate(all[i].id, stamps[i]);
  }
});

describe("listAuditLogs", () => {
  it("returns rows newest-first with pagination metadata", async () => {
    const result = await listAuditLogs(
      db.prisma,
      {},
      { page: 1, pageSize: 25 },
    );
    expect(result.total).toBe(4);
    expect(result.rows).toHaveLength(4);
    expect(result.totalPages).toBe(1);
    expect(result.rows[0].action).toBe("PUBLISH");
    expect(result.rows[3].action).toBe("CREATE");
    expect(result.rows[0].userEmail).toBe("bob@test.local");
    expect(result.rows[0].tenantId).toBe("default");
  });

  it("paginates with the given pageSize", async () => {
    const p1 = await listAuditLogs(db.prisma, {}, { page: 1, pageSize: 2 });
    expect(p1.rows).toHaveLength(2);
    expect(p1.totalPages).toBe(2);
    expect(p1.rows.map((r) => r.action)).toEqual(["PUBLISH", "DELETE"]);

    const p2 = await listAuditLogs(db.prisma, {}, { page: 2, pageSize: 2 });
    expect(p2.rows).toHaveLength(2);
    expect(p2.rows.map((r) => r.action)).toEqual(["UPDATE", "CREATE"]);
  });

  it("filters by user, entity, and action", async () => {
    const byTenant = await listAuditLogs(
      db.prisma,
      { tenantId: "default" },
      { page: 1, pageSize: 25 },
    );
    expect(byTenant.total).toBe(4);

    const byUser = await listAuditLogs(
      db.prisma,
      { userId: adminAId },
      { page: 1, pageSize: 25 },
    );
    expect(byUser.total).toBe(2);
    expect(byUser.rows.every((r) => r.userId === adminAId)).toBe(true);

    const byEntity = await listAuditLogs(
      db.prisma,
      { entity: "Week" },
      { page: 1, pageSize: 25 },
    );
    expect(byEntity.total).toBe(1);
    expect(byEntity.rows[0].action).toBe("PUBLISH");

    const byAction = await listAuditLogs(
      db.prisma,
      { action: "DELETE" },
      { page: 1, pageSize: 25 },
    );
    expect(byAction.total).toBe(1);
    expect(byAction.rows[0].entity).toBe("PlanEntry");
  });

  it("filters by inclusive date range", async () => {
    const result = await listAuditLogs(
      db.prisma,
      { fromIso: "2026-03-12", toIso: "2026-03-15" },
      { page: 1, pageSize: 25 },
    );
    expect(result.total).toBe(2);
    expect(result.rows.map((r) => r.action).sort()).toEqual([
      "DELETE",
      "UPDATE",
    ]);
  });

  it("parses oldValue/newValue back to objects", async () => {
    const result = await listAuditLogs(
      db.prisma,
      { action: "UPDATE" },
      { page: 1, pageSize: 25 },
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].oldValue).toEqual({ firstName: "Anna", pensum: 80 });
    expect(result.rows[0].newValue).toEqual({ firstName: "Anna", pensum: 100 });
    expect(result.rows[0].comment).toBe("Aufstockung");
  });

  it("clamps pageSize to a sane upper bound", async () => {
    const result = await listAuditLogs(
      db.prisma,
      {},
      { page: 1, pageSize: 99999 },
    );
    expect(result.pageSize).toBeLessThanOrEqual(200);
  });
});

describe("loadAuditFacets", () => {
  it("returns distinct entities, actions, and users that have logs", async () => {
    const facets = await loadAuditFacets(db.prisma);
    expect(facets.tenantIds).toEqual(["default"]);
    expect(facets.entities.sort()).toEqual([
      "Employee",
      "PlanEntry",
      "Week",
    ]);
    expect(facets.actions.sort()).toEqual([
      "CREATE",
      "DELETE",
      "PUBLISH",
      "UPDATE",
    ]);
    expect(facets.users.map((u) => u.email).sort()).toEqual([
      "alice@test.local",
      "bob@test.local",
    ]);
  });
});

describe("computeAuditDiff", () => {
  it("returns the union of top-level keys with changed flags", async () => {
    const diff = computeAuditDiff(
      { firstName: "Anna", pensum: 80, roleLabel: null },
      { firstName: "Anna", pensum: 100, locationId: "loc-1" },
    );
    const keyed = new Map(diff.map((d) => [d.key, d] as const));
    expect(keyed.get("firstName")?.changed).toBe(false);
    expect(keyed.get("pensum")?.changed).toBe(true);
    expect(keyed.get("roleLabel")?.changed).toBe(true);
    expect(keyed.get("locationId")?.changed).toBe(true);
    expect(keyed.get("locationId")?.before).toBeUndefined();
  });

  it("returns an empty array when neither side is an object", async () => {
    expect(computeAuditDiff(null, null)).toEqual([]);
    expect(computeAuditDiff("foo", 42)).toEqual([]);
  });

  it("handles a one-sided payload (CREATE / DELETE)", async () => {
    const created = computeAuditDiff(null, { firstName: "Anna" });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      key: "firstName",
      before: undefined,
      after: "Anna",
      changed: true,
    });
  });
});
