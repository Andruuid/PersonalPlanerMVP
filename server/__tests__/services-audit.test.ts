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
    serviceTemplate: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
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
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null,
  readBooleanFlag: (v: FormDataEntryValue | null) =>
    v === "true" || v === "on" || v === "1",
}));

import { createServiceAction, updateServiceAction } from "@/server/services";

function buildBaseFormData(): FormData {
  const fd = new FormData();
  fd.set("name", "Frühdienst");
  fd.set("code", "FRUEH");
  fd.set("startTime", "07:00");
  fd.set("endTime", "15:30");
  fd.set("breakMinutes", "30");
  fd.set("comment", "");
  fd.set("isActive", "on");
  return fd;
}

describe("service template defaultDays/requiredCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ id: "admin-1", tenantId: "tenant-a" });
    writeAuditMock.mockResolvedValue(undefined);
    prismaMock.serviceTemplate.findUnique.mockResolvedValue(null);
  });

  it("persists Mo|Mi|Fr bitmask and requiredCount on create and audits the new values", async () => {
    const fd = buildBaseFormData();
    fd.set("defaultDay0", "on"); // Mo
    fd.set("defaultDay2", "on"); // Mi
    fd.set("defaultDay4", "on"); // Fr
    fd.set("requiredCount", "2");

    prismaMock.serviceTemplate.create.mockResolvedValue({
      id: "svc-1",
      name: "Frühdienst",
      code: "FRUEH",
      startTime: "07:00",
      endTime: "15:30",
      breakMinutes: 30,
      comment: null,
      defaultDays: 21,
      requiredCount: 2,
      isActive: true,
    });

    const result = await createServiceAction(undefined, fd);

    expect(result.ok).toBe(true);
    expect(prismaMock.serviceTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          defaultDays: 21,
          requiredCount: 2,
        }),
      }),
    );
    const auditCall = writeAuditMock.mock.calls.find(
      ([payload]) =>
        payload.entity === "ServiceTemplate" && payload.action === "CREATE",
    );
    expect(auditCall).toBeDefined();
    expect(auditCall?.[0].newValue).toEqual(
      expect.objectContaining({
        defaultDays: 21,
        requiredCount: 2,
      }),
    );
  });

  it("treats no checked weekdays + empty requiredCount as null on create", async () => {
    const fd = buildBaseFormData();

    prismaMock.serviceTemplate.create.mockResolvedValue({
      id: "svc-2",
      name: "Frühdienst",
      code: "FRUEH",
      startTime: "07:00",
      endTime: "15:30",
      breakMinutes: 30,
      comment: null,
      defaultDays: null,
      requiredCount: null,
      isActive: true,
    });

    await createServiceAction(undefined, fd);

    expect(prismaMock.serviceTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          defaultDays: null,
          requiredCount: null,
        }),
      }),
    );
  });

  it("audits oldValue and newValue for defaultDays/requiredCount on update", async () => {
    const fd = buildBaseFormData();
    fd.set("id", "svc-1");
    fd.set("defaultDay0", "on"); // Mo
    fd.set("defaultDay2", "on"); // Mi
    fd.set("defaultDay4", "on"); // Fr
    fd.set("requiredCount", "3");

    prismaMock.serviceTemplate.findUnique.mockResolvedValueOnce({
      id: "svc-1",
      tenantId: "tenant-a",
      name: "Frühdienst",
      code: "FRUEH",
      startTime: "07:00",
      endTime: "15:30",
      breakMinutes: 30,
      comment: null,
      defaultDays: 1, // Mo only
      requiredCount: 1,
      isActive: true,
    });

    prismaMock.serviceTemplate.update.mockResolvedValue({
      id: "svc-1",
      name: "Frühdienst",
      code: "FRUEH",
      startTime: "07:00",
      endTime: "15:30",
      breakMinutes: 30,
      comment: null,
      defaultDays: 21,
      requiredCount: 3,
      isActive: true,
    });

    const result = await updateServiceAction(undefined, fd);

    expect(result.ok).toBe(true);
    expect(prismaMock.serviceTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          defaultDays: 21,
          requiredCount: 3,
        }),
      }),
    );
    const auditCall = writeAuditMock.mock.calls.find(
      ([payload]) =>
        payload.entity === "ServiceTemplate" && payload.action === "UPDATE",
    );
    expect(auditCall).toBeDefined();
    expect(auditCall?.[0].oldValue).toEqual(
      expect.objectContaining({
        defaultDays: 1,
        requiredCount: 1,
      }),
    );
    expect(auditCall?.[0].newValue).toEqual(
      expect.objectContaining({
        defaultDays: 21,
        requiredCount: 3,
      }),
    );
  });
});
