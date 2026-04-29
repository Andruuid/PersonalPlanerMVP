import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodError } from "zod";

const {
  requireAdminMock,
  safeRevalidatePathMock,
  applyManualBookingMock,
  applyYearEndCarryoverMock,
  deleteBookingMock,
  writeAuditMock,
  prismaMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  safeRevalidatePathMock: vi.fn(),
  applyManualBookingMock: vi.fn(),
  applyYearEndCarryoverMock: vi.fn(),
  deleteBookingMock: vi.fn(),
  writeAuditMock: vi.fn(),
  prismaMock: {},
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

vi.mock("@/lib/audit", () => ({ writeAudit: writeAuditMock }));

vi.mock("@/lib/bookings/core", () => ({
  applyManualBooking: applyManualBookingMock,
  applyYearEndCarryover: applyYearEndCarryoverMock,
  deleteBooking: deleteBookingMock,
  ManualBookingError: class ManualBookingError extends Error {},
  DeleteBookingError: class DeleteBookingError extends Error {},
}));

vi.mock("@/server/_shared", () => ({
  requireAdmin: requireAdminMock,
  safeRevalidatePath: safeRevalidatePathMock,
  fieldErrorsFromZod: (err: ZodError) => {
    const out: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".");
      if (key && !out[key]) out[key] = issue.message;
    }
    return out;
  },
  readOptionalString: (v: FormDataEntryValue | null) =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null,
}));

import { manualBookingAction } from "@/server/bookings";

function buildBookingFormData(
  overrides: Record<string, string> = {},
): FormData {
  const fd = new FormData();
  fd.set("employeeId", "emp-1");
  fd.set("accountType", "ZEITSALDO");
  fd.set("date", "2026-04-15");
  fd.set("value", "60");
  fd.set("bookingType", "MANUAL_CREDIT");
  fd.set("comment", "Bonus");
  for (const [k, v] of Object.entries(overrides)) {
    fd.set(k, v);
  }
  return fd;
}

describe("manualBookingAction account-type validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ id: "admin-1", tenantId: "tenant-a" });
  });

  it("rejects accountType=SONNTAG_FEIERTAG_KOMPENSATION with a clear message and never books", async () => {
    const result = await manualBookingAction(
      undefined,
      buildBookingFormData({ accountType: "SONNTAG_FEIERTAG_KOMPENSATION" }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Bitte Eingaben prüfen.");
    expect(result.fieldErrors?.accountType).toMatch(
      /Sonn-\/Feiertagskompensation|nicht zulässig/i,
    );
    expect(applyManualBookingMock).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
    expect(safeRevalidatePathMock).not.toHaveBeenCalled();
  });

  it("accepts a normal ZEITSALDO booking and forwards to the core layer", async () => {
    applyManualBookingMock.mockResolvedValue({ bookingId: "b-1", signedValue: 60 });

    const result = await manualBookingAction(
      undefined,
      buildBookingFormData(),
    );

    expect(result.ok).toBe(true);
    expect(applyManualBookingMock).toHaveBeenCalledTimes(1);
    expect(applyManualBookingMock).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        accountType: "ZEITSALDO",
        bookingType: "MANUAL_CREDIT",
        value: 60,
      }),
    );
    expect(writeAuditMock).toHaveBeenCalledTimes(1);
  });
});
