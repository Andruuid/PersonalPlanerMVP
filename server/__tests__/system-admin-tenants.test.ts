import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireSystemAdminMock,
  safeRevalidatePathMock,
  bcryptHashMock,
  writeAuditCoreMock,
  prismaMock,
} = vi.hoisted(() => ({
  requireSystemAdminMock: vi.fn(),
  safeRevalidatePathMock: vi.fn(),
  bcryptHashMock: vi.fn(),
  writeAuditCoreMock: vi.fn(),
  prismaMock: {
    tenant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: bcryptHashMock },
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/audit/core", () => ({
  writeAuditCore: writeAuditCoreMock,
}));

vi.mock("@/server/_shared", () => {
  function readOptionalString(value: FormDataEntryValue | null): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  return {
    requireSystemAdmin: requireSystemAdminMock,
    safeRevalidatePath: safeRevalidatePathMock,
    readOptionalString,
    fieldErrorsFromZod: vi.fn(() => ({})),
  };
});

import {
  createTenantAction,
  deactivateTenantAction,
  reactivateTenantAction,
  updateTenantAction,
} from "@/server/system-admin/tenants";

describe("system-admin tenant actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSystemAdminMock.mockResolvedValue({
      id: "sys-admin-1",
      email: "sys@internal.local",
      role: "SYSTEM_ADMIN",
      tenantId: null,
      employeeId: null,
    });
    bcryptHashMock.mockResolvedValue("hashed-temp-password");
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        tenant: { create: vi.fn() },
        user: { create: vi.fn() },
        tenantId: "unused",
      }),
    );
  });

  it("createTenantAction creates tenant + admin and returns temporary password", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        tenant: {
          create: vi.fn().mockResolvedValue({
            id: "tenant-1",
            name: "Demo Betrieb 2",
            slug: "demo-betrieb-2",
          }),
        },
        user: {
          create: vi.fn().mockResolvedValue({ id: "admin-tenant-1" }),
        },
      }),
    );

    const fd = new FormData();
    fd.set("name", "Demo Betrieb 2");
    fd.set("slug", "demo-betrieb-2");
    fd.set("defaultWeeklyTargetMinutes", "2520");
    fd.set("defaultHazMinutesPerWeek", "2700");
    fd.set("adminEmail", "admin@demo-betrieb-2.ch");

    const result = await createTenantAction(undefined, fd);

    expect(requireSystemAdminMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data?.tenantId).toBe("tenant-1");
    expect(result.data?.temporaryPassword).toMatch(/^Tmp-/);
    expect(writeAuditCoreMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: "sys-admin-1",
        action: "TENANT_CREATED",
      }),
    );
  });

  it("createTenantAction rejects unauthenticated callers", async () => {
    requireSystemAdminMock.mockRejectedValueOnce(
      new Error("Unauthorized: not signed in"),
    );

    const fd = new FormData();
    fd.set("name", "Nicht erlaubt");
    fd.set("slug", "nicht-erlaubt");
    fd.set("defaultWeeklyTargetMinutes", "2520");
    fd.set("defaultHazMinutesPerWeek", "2700");
    fd.set("adminEmail", "blocked@example.com");

    await expect(createTenantAction(undefined, fd)).rejects.toThrow(
      "Unauthorized: not signed in",
    );
    expect(prismaMock.tenant.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("deactivateTenantAction sets deletedAt and writes audit", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      id: "tenant-2",
      deletedAt: null,
    });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        tenant: { update: vi.fn().mockResolvedValue({ id: "tenant-2" }) },
      }),
    );

    const result = await deactivateTenantAction("tenant-2");
    expect(result).toEqual({ ok: true });
    expect(writeAuditCoreMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "tenant-2",
        action: "TENANT_DEACTIVATED",
      }),
    );
  });

  it("reactivateTenantAction clears deletedAt and writes audit", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      id: "tenant-2",
      deletedAt: new Date("2026-01-01T00:00:00.000Z"),
      deletedById: "sys-admin-1",
    });
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        tenant: { update: vi.fn().mockResolvedValue({ id: "tenant-2" }) },
      }),
    );

    const result = await reactivateTenantAction("tenant-2");
    expect(result).toEqual({ ok: true });
    expect(writeAuditCoreMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "tenant-2",
        action: "TENANT_REACTIVATED",
      }),
    );
  });

  it("updateTenantAction updates tenant + writes audit", async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      id: "tenant-3",
      name: "Alt",
      slug: "alt",
      defaultWeeklyTargetMinutes: 2400,
      defaultHazMinutesPerWeek: 2600,
    });
    prismaMock.tenant.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        tenant: { update: vi.fn().mockResolvedValue({ id: "tenant-3" }) },
      }),
    );

    const fd = new FormData();
    fd.set("tenantId", "tenant-3");
    fd.set("name", "Neu");
    fd.set("slug", "neu");
    fd.set("defaultWeeklyTargetMinutes", "2520");
    fd.set("defaultHazMinutesPerWeek", "2700");

    const result = await updateTenantAction(fd);
    expect(result).toEqual({ ok: true });
    expect(writeAuditCoreMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: "tenant-3",
        action: "TENANT_UPDATED",
      }),
    );
  });
});
