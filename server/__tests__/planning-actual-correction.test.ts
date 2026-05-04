import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  requireAdminMock,
  writeAuditMock,
  safeRevalidatePathMock,
  logServerErrorMock,
} = vi.hoisted(() => ({
  prismaMock: {
    planEntry: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
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

import { correctPlanEntryActualMinutesAction } from "@/server/planning";

describe("correctPlanEntryActualMinutesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      tenantId: "tenant-1",
    });
  });

  it("writes an audit log for admin correction", async () => {
    prismaMock.planEntry.findFirst.mockResolvedValue({
      id: "entry-1",
      weekId: "week-1",
      week: { tenantId: "tenant-1", status: "DRAFT" },
      kind: "ONE_TIME_SHIFT",
      plannedMinutes: 480,
      correctedActualMinutes: null,
      correctedActualComment: null,
      correctedActualAt: null,
      correctedActualByUserId: null,
      serviceTemplateId: null,
      oneTimeStart: "08:00",
      oneTimeEnd: "16:30",
      oneTimeBreakMinutes: 30,
      oneTimeLabel: "Shift",
      absenceType: null,
      weekendWorkClassification: null,
      comment: null,
      deletedAt: null,
    });
    prismaMock.planEntry.update.mockResolvedValue({
      id: "entry-1",
      kind: "ONE_TIME_SHIFT",
      plannedMinutes: 480,
      correctedActualMinutes: 450,
      correctedActualComment: "manual correction",
      correctedActualAt: new Date("2026-05-01T12:00:00.000Z"),
      correctedActualByUserId: "admin-1",
      serviceTemplateId: null,
      oneTimeStart: "08:00",
      oneTimeEnd: "16:30",
      oneTimeBreakMinutes: 30,
      oneTimeLabel: "Shift",
      absenceType: null,
      weekendWorkClassification: null,
      comment: null,
    });

    const result = await correctPlanEntryActualMinutesAction(
      "entry-1",
      450,
      "manual correction",
    );

    expect(result).toEqual({ ok: true });
    expect(prismaMock.planEntry.update).toHaveBeenCalledWith({
      where: { id: "entry-1" },
      data: expect.objectContaining({
        correctedActualMinutes: 450,
        correctedActualComment: "manual correction",
        correctedActualByUserId: "admin-1",
      }),
    });
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        action: "ACTUAL_TIME_CORRECTION",
        entity: "PlanEntry",
        entityId: "entry-1",
      }),
    );
  });
});
