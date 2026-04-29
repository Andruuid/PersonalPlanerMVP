import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { provisionNewTenant, signupSchema } from "@/server/onboarding-core";

describe("provisionNewTenant (smoke)", () => {
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

  it("legt Tenant, Admin-User, Hauptstandort, drei Services und Audit an", async () => {
    const slug = `signup-${Date.now()}`;
    const parsed = signupSchema.parse({
      businessName: "Smoke GmbH",
      slug,
      adminEmail: "admin-smoke@test.local",
      adminPassword: "secret12",
    });

    const result = await provisionNewTenant(db.prisma, parsed);
    expect(result).toEqual(
      expect.objectContaining({ ok: true, slug: parsed.slug }),
    );
    if (!result.ok) throw new Error("expected ok");

    const tenant = await db.prisma.tenant.findUnique({
      where: { id: result.tenantId },
    });
    expect(tenant?.name).toBe("Smoke GmbH");
    expect(tenant?.slug).toBe(parsed.slug);

    const admin = await db.prisma.user.findFirst({
      where: { tenantId: result.tenantId, role: "ADMIN" },
    });
    expect(admin?.email).toBe("admin-smoke@test.local");

    const loc = await db.prisma.location.findFirst({
      where: { tenantId: result.tenantId },
    });
    expect(loc?.name).toBe("Hauptstandort");
    expect(loc?.holidayRegionCode).toBe("EVANGELISCH");

    const services = await db.prisma.serviceTemplate.findMany({
      where: { tenantId: result.tenantId },
      orderBy: { code: "asc" },
    });
    expect(services.map((s) => s.code)).toEqual(["FRUEH", "SAMSTAG", "SPAET"]);

    const audits = await db.prisma.auditLog.findMany({
      where: {
        tenantId: result.tenantId,
        entity: "Tenant",
        action: "CREATE",
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.entityId).toBe(result.tenantId);
    expect(audits[0]?.userId).toBe(admin?.id);
  });

  it("lehnt doppelten Slug ab", async () => {
    const slug = `dup-${Date.now()}`;
    const base = signupSchema.parse({
      businessName: "A",
      slug,
      adminEmail: "a@test.local",
      adminPassword: "secret12",
    });
    const ok = await provisionNewTenant(db.prisma, base);
    expect(ok.ok).toBe(true);

    const dup = await provisionNewTenant(
      db.prisma,
      signupSchema.parse({
        businessName: "B",
        slug,
        adminEmail: "b@test.local",
        adminPassword: "secret12",
      }),
    );
    expect(dup.ok).toBe(false);
    if (dup.ok) throw new Error("expected failure");
    expect(dup.fieldErrors?.slug).toBeDefined();
  });

  it("lehnt doppelte Admin-E-Mail für zweiten Mandanten ab", async () => {
    const ts = Date.now();
    const email = `duplicate-admin-${ts}@test.local`;
    const first = signupSchema.parse({
      businessName: "Erste GmbH",
      slug: `first-${ts}`,
      adminEmail: email,
      adminPassword: "secret12",
    });
    const okFirst = await provisionNewTenant(db.prisma, first);
    expect(okFirst.ok).toBe(true);

    const dup = await provisionNewTenant(
      db.prisma,
      signupSchema.parse({
        businessName: "Zweite GmbH",
        slug: `second-${ts}`,
        adminEmail: email,
        adminPassword: "secret12",
      }),
    );
    expect(dup.ok).toBe(false);
    if (dup.ok) throw new Error("expected failure");
    expect(dup.fieldErrors?.adminEmail).toBeDefined();
  });
});
