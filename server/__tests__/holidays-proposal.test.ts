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
    location: {
      findUnique: vi.fn(),
    },
    holiday: {
      findMany: vi.fn(),
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
  fieldErrorsFromZod: vi.fn((err) => {
    const out: Record<string, string> = {};
    for (const issue of err.issues ?? []) {
      const key = Array.isArray(issue.path) ? issue.path.join(".") : "";
      if (key && !out[key]) out[key] = issue.message;
    }
    return out;
  }),
  readOptionalString: (v: FormDataEntryValue | null) =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null,
}));

import {
  acceptProposedHolidaysAction,
  proposeHolidaysForLocationAction,
} from "@/server/holidays";

describe("holiday proposal + accept flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ id: "admin-1", tenantId: "tenant-a" });
    prismaMock.location.findUnique.mockResolvedValue({
      tenantId: "tenant-a",
      deletedAt: null,
    });
    writeAuditMock.mockResolvedValue(undefined);
  });

  it("proposes evangelisch holidays without writing DB rows", async () => {
    const result = await proposeHolidaysForLocationAction(
      "loc-zurich",
      2026,
      "EVANGELISCH",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`Expected ok result, got: ${result.error}`);
    }
    const holidays = result.data?.holidays ?? [];
    expect(holidays.length).toBeGreaterThan(0);
    expect(holidays.some((h) => h.name === "Bundesfeier")).toBe(true);
    expect(holidays.some((h) => h.name === "Fronleichnam")).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("accepts edited holidays idempotently and writes HOLIDAYS_UPDATED diff", async () => {
    prismaMock.holiday.findMany.mockResolvedValue([
      {
        id: "h-1",
        date: new Date("2026-01-01T00:00:00.000Z"),
        name: "Neujahr",
      },
      {
        id: "h-2",
        date: new Date("2026-05-01T00:00:00.000Z"),
        name: "Tag der Arbeit",
      },
      {
        id: "h-3",
        date: new Date("2026-12-26T00:00:00.000Z"),
        name: "Stephanstag",
      },
    ]);

    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const upsertMock = vi.fn().mockResolvedValue(undefined);
    prismaMock.$transaction.mockImplementation(async (cb) =>
      cb({
        holiday: {
          delete: deleteMock,
          upsert: upsertMock,
        },
      }),
    );

    const result = await acceptProposedHolidaysAction("loc-zurich", 2026, [
      { date: "2026-01-01", name: "Neujahr" },
      { date: "2026-05-01", name: "Tag der Arbeit (ZH)" },
      { date: "2026-04-20", name: "Sechselaeuten" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`Expected ok result, got: ${result.error}`);
    }
    expect(result.data).toEqual({ added: 1, removed: 1, updated: 1 });
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(3);
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "HOLIDAYS_UPDATED",
        entity: "Holiday",
        entityId: "loc-zurich",
        newValue: expect.objectContaining({
          diff: expect.objectContaining({
            added: [{ date: "2026-04-20", name: "Sechselaeuten" }],
            removed: [{ date: "2026-12-26", name: "Stephanstag" }],
            updated: [
              {
                date: "2026-05-01",
                from: "Tag der Arbeit",
                to: "Tag der Arbeit (ZH)",
              },
            ],
          }),
        }),
      }),
    );
  });
});
