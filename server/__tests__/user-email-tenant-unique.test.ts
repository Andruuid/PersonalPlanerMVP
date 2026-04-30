import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";

describe("User email uniqueness per tenant", () => {
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

  it("allows same email in different tenants", async () => {
    const tenantA = await db.prisma.tenant.create({
      data: { id: "tenant-a", name: "Tenant A", slug: "tenant-a" },
    });
    const tenantB = await db.prisma.tenant.create({
      data: { id: "tenant-b", name: "Tenant B", slug: "tenant-b" },
    });

    await db.prisma.user.create({
      data: {
        tenantId: tenantA.id,
        email: "multi@test.local",
        passwordHash: "x",
        role: "ADMIN",
      },
    });
    await expect(
      db.prisma.user.create({
        data: {
          tenantId: tenantB.id,
          email: "multi@test.local",
          passwordHash: "x",
          role: "ADMIN",
        },
      }),
    ).resolves.toBeDefined();
  });

  it("rejects same email in same tenant", async () => {
    await db.prisma.user.create({
      data: {
        tenantId: "default",
        email: "dup@test.local",
        passwordHash: "x",
        role: "ADMIN",
      },
    });

    await expect(
      db.prisma.user.create({
        data: {
          tenantId: "default",
          email: "dup@test.local",
          passwordHash: "x",
          role: "EMPLOYEE",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
