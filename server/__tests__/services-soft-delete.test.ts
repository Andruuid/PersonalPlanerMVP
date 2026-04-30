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
      update: vi.fn(),
    },
    planEntry: {
      findFirst: vi.fn(),
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

import {
  setServiceActiveAction,
  softDeleteServiceTemplateAction,
} from "@/server/services";

describe("service template soft delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ id: "admin-1", tenantId: "tenant-a" });
    writeAuditMock.mockResolvedValue(undefined);
  });

  const activeTemplate = {
    id: "svc-1",
    tenantId: "tenant-a",
    name: "Früh",
    code: "FRUEH",
    isActive: true,
    deletedAt: null,
    archivedUntil: null,
  };

  it("softDeleteServiceTemplateAction refuses when template is used in an open week", async () => {
    prismaMock.serviceTemplate.findUnique.mockResolvedValue(activeTemplate);
    prismaMock.planEntry.findFirst.mockResolvedValue({ id: "pe-1" });

    const result = await softDeleteServiceTemplateAction("svc-1");

    expect(result).toEqual({
      ok: false,
      error:
        "Template wird in aktiven Wochen verwendet — bitte zuerst dort entfernen oder Woche schließen.",
    });
    expect(prismaMock.serviceTemplate.update).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("softDeleteServiceTemplateAction archives template when safe", async () => {
    prismaMock.serviceTemplate.findUnique.mockResolvedValue(activeTemplate);
    prismaMock.planEntry.findFirst.mockResolvedValue(null);
    prismaMock.serviceTemplate.update.mockResolvedValue({
      ...activeTemplate,
      isActive: false,
      deletedAt: new Date("2026-04-30T12:00:00.000Z"),
      archivedUntil: new Date("2036-04-30T12:00:00.000Z"),
    });

    const result = await softDeleteServiceTemplateAction("svc-1");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.serviceTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "svc-1" },
        data: expect.objectContaining({
          isActive: false,
          deletedAt: expect.any(Date),
          archivedUntil: expect.any(Date),
        }),
      }),
    );
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entity: "ServiceTemplate",
        entityId: "svc-1",
      }),
    );
  });

  it("softDeleteServiceTemplateAction rejects already archived templates", async () => {
    prismaMock.serviceTemplate.findUnique.mockResolvedValue({
      ...activeTemplate,
      deletedAt: new Date(),
      archivedUntil: new Date(),
    });

    const result = await softDeleteServiceTemplateAction("svc-1");

    expect(result).toEqual({
      ok: false,
      error: "Dienstvorlage ist bereits archiviert.",
    });
    expect(prismaMock.planEntry.findFirst).not.toHaveBeenCalled();
  });

  it("setServiceActiveAction rejects archived templates", async () => {
    prismaMock.serviceTemplate.findUnique.mockResolvedValue({
      ...activeTemplate,
      deletedAt: new Date(),
    });

    const result = await setServiceActiveAction("svc-1", true);

    expect(result).toEqual({
      ok: false,
      error: "Dienstvorlage ist archiviert.",
    });
    expect(prismaMock.serviceTemplate.update).not.toHaveBeenCalled();
  });
});
