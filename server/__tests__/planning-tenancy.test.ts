import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  requireAdminMock,
  writeAuditMock,
  safeRevalidatePathMock,
  logServerErrorMock,
} = vi.hoisted(() => ({
    prismaMock: {
      employee: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      planEntry: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      week: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
    },
    requireAdminMock: vi.fn(),
    writeAuditMock: vi.fn(),
    safeRevalidatePathMock: vi.fn(),
    logServerErrorMock: vi.fn((_scope: string, err: unknown) => {
      throw err;
    }),
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
  actionErrorFromDatabase: vi.fn(() => "database error"),
  logServerError: logServerErrorMock,
}));

import { movePlanEntryAction } from "@/server/planning";

describe("planning tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      id: "admin-a",
      email: "admin-a@example.com",
      role: "ADMIN",
      tenantId: "tenant-a",
    });
  });

  it("rejects moving a plan entry to an employee from another tenant", async () => {
    prismaMock.planEntry.findFirst.mockResolvedValue({
      id: "entry-a",
      weekId: "week-a",
      employeeId: "employee-a",
      date: new Date("2026-04-13T00:00:00.000Z"),
      deletedAt: null,
      kind: "SHIFT",
      serviceTemplateId: null,
      oneTimeStart: null,
      oneTimeEnd: null,
      oneTimeBreakMinutes: null,
      oneTimeLabel: null,
      absenceType: null,
      plannedMinutes: 480,
      comment: null,
    });
    // Employee in another tenant: findFirst with where: { tenantId: "tenant-a" }
    // returns null because the employee is in tenant-b.
    prismaMock.employee.findFirst.mockResolvedValue(null);
    prismaMock.week.findFirst.mockResolvedValue({
      id: "week-a",
      tenantId: "tenant-a",
      deletedAt: null,
      status: "DRAFT",
    });

    const result = await movePlanEntryAction(
      "entry-a",
      "employee-b",
      "2026-04-14",
    );

    expect(result).toEqual({
      ok: false,
      error: "Mitarbeitende:r nicht gefunden.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });
});
