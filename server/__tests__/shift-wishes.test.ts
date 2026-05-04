import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  requireAdminMock,
  requireEmployeeMock,
  writeAuditMock,
  safeRevalidatePathMock,
} = vi.hoisted(() => ({
  prismaMock: {
    shiftWish: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    employee: {
      findFirst: vi.fn(),
    },
    week: {
      findFirst: vi.fn(),
    },
    serviceTemplate: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  requireAdminMock: vi.fn(),
  requireEmployeeMock: vi.fn(),
  writeAuditMock: vi.fn(),
  safeRevalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: writeAuditMock,
}));

vi.mock("@/server/_shared", () => ({
  requireAdmin: requireAdminMock,
  requireEmployee: requireEmployeeMock,
  safeRevalidatePath: safeRevalidatePathMock,
  fieldErrorsFromZod: vi.fn(),
  readOptionalString: vi.fn(),
}));

vi.mock("@/lib/ert/sweep", () => ({
  maybeSweepErtAfterPlanWrite: vi.fn(),
}));

import {
  approveShiftWishAction,
  rejectShiftWishAction,
  withdrawShiftWishAction,
} from "@/server/shift-wishes";

describe("approveShiftWishAction CLOSED week protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      tenantId: "tenant-a",
    });
  });

  it("aborts without transaction or audit when week is CLOSED", async () => {
    prismaMock.shiftWish.findFirst.mockResolvedValue({
      id: "wish-1",
      tenantId: "tenant-a",
      employeeId: "emp-1",
      status: "OPEN",
      date: new Date("2026-04-15T00:00:00.000Z"),
      deletedAt: null,
      comment: null,
      preferredServiceTemplateId: "tpl-1",
      preferredOneTimeLabel: null,
      oneTimeStart: null,
      oneTimeEnd: null,
      oneTimeBreakMinutes: null,
      decisionComment: null,
    });
    prismaMock.employee.findFirst.mockResolvedValue({ id: "emp-1" });
    prismaMock.week.findFirst.mockResolvedValue({ status: "CLOSED" });

    const result = await approveShiftWishAction("wish-1");

    expect(result).toEqual({
      ok: false,
      error:
        "Die betroffene Woche ist abgeschlossen — Schicht-Wunsch kann nicht genehmigt werden. Bitte die Woche zuerst wieder öffnen.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
    expect(safeRevalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("rejectShiftWishAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      tenantId: "tenant-a",
    });
  });

  it("rejects when request week is CLOSED (no block)", async () => {
    prismaMock.shiftWish.findFirst.mockResolvedValue({
      id: "wish-2",
      tenantId: "tenant-a",
      employeeId: "emp-1",
      status: "OPEN",
      date: new Date("2026-04-15T00:00:00.000Z"),
      deletedAt: null,
      decisionComment: null,
    });
    prismaMock.week.findFirst.mockResolvedValue({ status: "CLOSED" });
    prismaMock.shiftWish.update.mockResolvedValue({});

    const result = await rejectShiftWishAction("wish-2", "Kein Bedarf");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.shiftWish.update).toHaveBeenCalled();
    expect(writeAuditMock).toHaveBeenCalled();
    expect(safeRevalidatePathMock).toHaveBeenCalled();
  });
});

describe("withdrawShiftWishAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireEmployeeMock.mockResolvedValue({
      id: "user-1",
      email: "e@test.local",
      role: "EMPLOYEE",
      tenantId: "tenant-a",
      employeeId: "emp-1",
    });
  });

  it("withdraws own open wish with WITHDRAW audit action", async () => {
    prismaMock.shiftWish.findFirst.mockResolvedValue({
      id: "wish-3",
      tenantId: "tenant-a",
      employeeId: "emp-1",
      status: "OPEN",
      date: new Date("2026-04-18T00:00:00.000Z"),
      deletedAt: null,
      decisionComment: null,
    });
    prismaMock.shiftWish.update.mockResolvedValue({});

    const result = await withdrawShiftWishAction("wish-3");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.shiftWish.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wish-3" },
        data: expect.objectContaining({
          status: "WITHDRAWN",
          decidedById: "user-1",
        }),
      }),
    );
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WITHDRAW",
        entity: "ShiftWish",
        entityId: "wish-3",
        newValue: expect.objectContaining({ status: "WITHDRAWN" }),
      }),
    );
  });
});
