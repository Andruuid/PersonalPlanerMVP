import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  safeRevalidatePathMock,
  writeAuditMock,
  bcryptHashMock,
  prismaMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  safeRevalidatePathMock: vi.fn(),
  writeAuditMock: vi.fn(),
  bcryptHashMock: vi.fn(),
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: bcryptHashMock },
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: writeAuditMock,
}));

vi.mock("@/server/_shared", () => ({
  requireAdmin: requireAdminMock,
  safeRevalidatePath: safeRevalidatePathMock,
}));

import {
  changeAdminUserRoleAction,
  resetAdminUserPasswordAction,
  setAdminUserLockAction,
} from "@/server/users-admin";

describe("users-admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      id: "admin-self",
      tenantId: "tenant-a",
      role: "ADMIN",
      email: "admin@example.com",
      employeeId: null,
    });
    writeAuditMock.mockResolvedValue(undefined);
    bcryptHashMock.mockResolvedValue("hashed-temp-password");
  });

  it("rejects self-edit for lock action", async () => {
    const result = await setAdminUserLockAction("admin-self", true);
    expect(result).toEqual({
      ok: false,
      error: "Du kannst dich hier nicht selbst bearbeiten.",
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("locks/unlocks user and writes audit", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-2",
      tenantId: "tenant-a",
      isActive: true,
    });
    prismaMock.user.update.mockResolvedValue({ id: "user-2" });

    const result = await setAdminUserLockAction("user-2", true);

    expect(result).toEqual({ ok: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { isActive: false },
    });
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOCK_USER",
        entity: "User",
        entityId: "user-2",
      }),
    );
  });

  it("changes role for another user and writes ROLE_CHANGE", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-3",
      tenantId: "tenant-a",
      role: "EMPLOYEE",
    });
    prismaMock.user.update.mockResolvedValue({ id: "user-3", role: "ADMIN" });

    const result = await changeAdminUserRoleAction("user-3", "ADMIN");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-3" },
      data: { role: "ADMIN" },
    });
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ROLE_CHANGE",
        oldValue: { role: "EMPLOYEE" },
        newValue: { role: "ADMIN" },
      }),
    );
  });

  it("allows ADMIN to demote another ADMIN to EMPLOYEE", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-5",
      tenantId: "tenant-a",
      role: "ADMIN",
    });
    prismaMock.user.update.mockResolvedValue({ id: "user-5", role: "EMPLOYEE" });

    const result = await changeAdminUserRoleAction("user-5", "EMPLOYEE");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-5" },
      data: { role: "EMPLOYEE" },
    });
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ROLE_CHANGE",
        oldValue: { role: "ADMIN" },
        newValue: { role: "EMPLOYEE" },
      }),
    );
  });

  it("rejects assigning SYSTEM_ADMIN from tenant admin action", async () => {
    const result = await changeAdminUserRoleAction("user-6", "SYSTEM_ADMIN");

    expect(result).toEqual({
      ok: false,
      error: "Diese Rolle darf hier nicht vergeben werden.",
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("rejects editing users with SYSTEM_ADMIN role", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-7",
      tenantId: "tenant-a",
      role: "SYSTEM_ADMIN",
    });

    const result = await changeAdminUserRoleAction("user-7", "ADMIN");

    expect(result).toEqual({
      ok: false,
      error: "Diese Rolle darf hier nicht bearbeitet werden.",
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("resets password and audits passwordReset flag only", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-4",
      tenantId: "tenant-a",
    });
    prismaMock.user.update.mockResolvedValue({ id: "user-4" });

    const result = await resetAdminUserPasswordAction("user-4");

    expect(result.ok).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-4" },
      data: { passwordHash: "hashed-temp-password" },
    });
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PASSWORD_RESET",
        entity: "User",
        entityId: "user-4",
        newValue: { passwordReset: true },
      }),
    );
    expect(writeAuditMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: expect.anything(),
      }),
    );
  });
});
