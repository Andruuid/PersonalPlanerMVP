import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodError } from "zod";

const {
  requireAdminMock,
  safeRevalidatePathMock,
  applyManualBookingMock,
  writeAuditMock,
  prismaMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  safeRevalidatePathMock: vi.fn(),
  applyManualBookingMock: vi.fn(),
  writeAuditMock: vi.fn(),
  prismaMock: {
    employee: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

vi.mock("@/lib/audit", () => ({ writeAudit: writeAuditMock }));

vi.mock("@/lib/bookings/core", () => ({
  applyManualBooking: applyManualBookingMock,
  ManualBookingError: class ManualBookingError extends Error {},
}));

vi.mock("@/server/_shared", () => ({
  requireAdmin: requireAdminMock,
  safeRevalidatePath: safeRevalidatePathMock,
  fieldErrorsFromZod: (err: ZodError) => {
    const out: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      if (!out[key]) out[key] = issue.message;
    }
    return out;
  },
}));

import { grantParentalCareAction } from "@/server/accounts";

describe("grantParentalCareAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ id: "admin-1", tenantId: "tenant-a" });
    prismaMock.employee.findFirst.mockResolvedValue({ id: "emp-1" });
    applyManualBookingMock.mockResolvedValue({
      bookingId: "booking-pc-1",
      signedValue: 3.5,
    });
    writeAuditMock.mockResolvedValue(undefined);
  });

  it("lehnt kurze Begründung mit Feldfehler ab und bucht nicht", async () => {
    const result = await grantParentalCareAction(
      "emp-1",
      3,
      "zu kurz",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.comment).toMatch(/10 Zeichen/i);
    expect(applyManualBookingMock).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
    expect(safeRevalidatePathMock).not.toHaveBeenCalled();
  });

  it("lehnt unbekannte:n Mitarbeitende:n ab", async () => {
    prismaMock.employee.findFirst.mockResolvedValue(null);

    const result = await grantParentalCareAction(
      "emp-x",
      2,
      "Ausreichend lange Begründung hier.",
    );

    expect(result.ok).toBe(false);
    expect(applyManualBookingMock).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("bucht PARENTAL_CARE MANUAL_CREDIT und schreibt Audit PARENTAL_CARE_GRANT", async () => {
    const result = await grantParentalCareAction(
      "emp-1",
      3.5,
      "Freigabe nach interner Vereinbarung ab nächstem Monat.",
    );

    expect(result.ok).toBe(true);
    expect(applyManualBookingMock).toHaveBeenCalledTimes(1);
    expect(applyManualBookingMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        employeeId: "emp-1",
        tenantId: "tenant-a",
        accountType: "PARENTAL_CARE",
        bookingType: "MANUAL_CREDIT",
        value: 3.5,
        createdByUserId: "admin-1",
      }),
    );

    expect(writeAuditMock).toHaveBeenCalledTimes(1);
    const [auditPayload] = writeAuditMock.mock.calls[0]!;
    expect(auditPayload.action).toBe("PARENTAL_CARE_GRANT");
    expect(auditPayload.entity).toBe("Booking");
    expect(auditPayload.entityId).toBe("booking-pc-1");
    expect(auditPayload.newValue).toMatchObject({
      employeeId: "emp-1",
      days: 3.5,
    });

    expect(safeRevalidatePathMock).toHaveBeenCalled();
  });
});
