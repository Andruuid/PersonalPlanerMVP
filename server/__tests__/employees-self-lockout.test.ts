import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  safeRevalidatePathMock,
  writeAuditMock,
  prismaMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  safeRevalidatePathMock: vi.fn(),
  writeAuditMock: vi.fn(),
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    employee: {
      findUnique: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
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
  fieldErrorsFromZod: vi.fn(),
  readOptionalString: (v: FormDataEntryValue | null) =>
    typeof v === "string" ? v : null,
  readBooleanFlag: (v: FormDataEntryValue | null) =>
    v === "true" || v === "on" || v === "1",
}));

import {
  setEmployeeActiveAction,
  setUserLockAction,
  updateEmployeeAction,
} from "@/server/employees";

function buildUpdateFormData(overrides?: { isActive?: boolean }): FormData {
  const fd = new FormData();
  fd.set("id", "emp-self");
  fd.set("email", "self.admin@example.com");
  fd.set("firstName", "Self");
  fd.set("lastName", "Admin");
  fd.set("roleLabel", "Leitung");
  fd.set("pensum", "100");
  fd.set("entryDate", "2026-01-01");
  fd.set("locationId", "loc-1");
  fd.set("vacationDaysPerYear", "25");
  fd.set("weeklyTargetMinutes", "2520");
  fd.set("hazMinutesPerWeek", "2700");
  fd.set("tztModel", "DAILY_QUOTA");
  fd.set("isActive", overrides?.isActive === false ? "off" : "on");
  return fd;
}

describe("employees self-lockout prevention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      id: "user-admin-self",
      tenantId: "tenant-a",
      employeeId: "emp-self",
    });
    writeAuditMock.mockResolvedValue(undefined);
    prismaMock.location.findUnique.mockResolvedValue({ tenantId: "tenant-a" });
  });

  it("setUserLockAction: rejects locking own user before DB update", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({
      id: "emp-self",
      tenantId: "tenant-a",
      userId: "user-admin-self",
      isActive: true,
      user: { id: "user-admin-self", isActive: true },
    });

    const result = await setUserLockAction(
      "emp-self",
      true,
      "Verdacht auf Missbrauch",
    );

    expect(result).toEqual({
      ok: false,
      error: "Du kannst dich nicht selbst sperren.",
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("setEmployeeActiveAction: rejects self-deactivation before DB update", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({
      id: "emp-self",
      tenantId: "tenant-a",
      userId: "user-admin-self",
      isActive: true,
      user: { id: "user-admin-self", isActive: true },
    });

    const result = await setEmployeeActiveAction("emp-self", false);

    expect(result).toEqual({
      ok: false,
      error: "Du kannst dich nicht selbst deaktivieren.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("updateEmployeeAction: rejects sole active admin demoting or deactivating self", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({
      id: "emp-self",
      tenantId: "tenant-a",
      userId: "user-admin-self",
      firstName: "Self",
      lastName: "Admin",
      roleLabel: "Leitung",
      pensum: 100,
      locationId: "loc-1",
      vacationDaysPerYear: 25,
      weeklyTargetMinutes: 2520,
      hazMinutesPerWeek: 2700,
      tztModel: "DAILY_QUOTA",
      isActive: true,
      deletedAt: null,
      archivedUntil: null,
      exitDate: null,
      user: {
        id: "user-admin-self",
        email: "self.admin@example.com",
        isActive: true,
        role: "ADMIN",
      },
    });
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.count.mockResolvedValue(1);

    const result = await updateEmployeeAction(
      undefined,
      buildUpdateFormData({ isActive: false }),
    );

    expect(result).toEqual({
      ok: false,
      error:
        "Als einzigem aktiven Admin können Sie sich nicht deaktivieren oder die Admin-Rolle entziehen.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
