import { describe, expect, it } from "vitest";
import { assertSameTenant, tenantWhere } from "@/lib/tenant/scope";

describe("tenant scope helpers", () => {
  it("builds a tenant where clause from session user", () => {
    expect(tenantWhere({ tenantId: "tenant-a" })).toEqual({ tenantId: "tenant-a" });
  });

  it("allows records from the same tenant", () => {
    expect(() =>
      assertSameTenant({ tenantId: "tenant-a" }, { tenantId: "tenant-a" }),
    ).not.toThrow();
  });

  it("rejects cross-tenant access", () => {
    expect(() =>
      assertSameTenant({ tenantId: "tenant-b" }, { tenantId: "tenant-a" }),
    ).toThrow(/tenant mismatch/i);
  });
});
