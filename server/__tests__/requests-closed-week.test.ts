import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  requireAdminMock,
  writeAuditMock,
  safeRevalidatePathMock,
} = vi.hoisted(() => ({
  prismaMock: {
    absenceRequest: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    employee: {
      findFirst: vi.fn(),
    },
    week: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  requireAdminMock: vi.fn(),
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
  requireEmployee: vi.fn(),
  safeRevalidatePath: safeRevalidatePathMock,
  fieldErrorsFromZod: vi.fn(),
  readOptionalString: vi.fn(),
}));

import { approveRequestAction } from "@/server/requests";

describe("approveRequestAction CLOSED week protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      tenantId: "tenant-a",
    });
  });

  it("aborts approval without audit or planEntry creation when the request touches a CLOSED week", async () => {
    prismaMock.absenceRequest.findFirst.mockResolvedValue({
      id: "req-1",
      tenantId: "tenant-a",
      employeeId: "emp-1",
      status: "OPEN",
      type: "VACATION",
      startDate: new Date("2026-04-13T00:00:00.000Z"),
      endDate: new Date("2026-04-15T00:00:00.000Z"),
      comment: null,
      decisionComment: null,
    });
    prismaMock.employee.findFirst.mockResolvedValue({ id: "emp-1" });
    prismaMock.week.findMany.mockResolvedValue([
      { year: 2026, weekNumber: 16, status: "CLOSED" },
    ]);

    const result = await approveRequestAction("req-1");

    expect(result).toEqual({
      ok: false,
      error:
        "Antrag berührt eine abgeschlossene Woche und kann so nicht genehmigt werden. Bitte Woche zuerst wieder öffnen oder Antrag passend zuschneiden.",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
    expect(safeRevalidatePathMock).not.toHaveBeenCalled();
  });
});
