import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { archiveUntil } from "@/lib/archive";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedEmployee, seedLocation } from "@/lib/test/fixtures";
import { purgeArchivedData } from "@/lib/archive/purge";

const {
  prismaMock,
  requireEmployeeMock,
  writeAuditMock,
  safeRevalidatePathMock,
} = vi.hoisted(() => ({
  prismaMock: {
    absenceRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
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
  requireAdmin: vi.fn(),
  requireEmployee: requireEmployeeMock,
  safeRevalidatePath: safeRevalidatePathMock,
  fieldErrorsFromZod: vi.fn(),
  readOptionalString: vi.fn(),
}));

import { cancelOwnRequestAction } from "@/server/requests";

describe("cancelOwnRequestAction", () => {
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

  it("sets CANCELLED and soft-delete fields instead of deleting the row", async () => {
    const start = new Date("2026-05-01T00:00:00.000Z");
    const end = new Date("2026-05-05T00:00:00.000Z");
    prismaMock.absenceRequest.findUnique.mockResolvedValue({
      id: "req-1",
      tenantId: "tenant-a",
      employeeId: "emp-1",
      status: "OPEN",
      type: "VACATION",
      startDate: start,
      endDate: end,
      deletedAt: null,
    });
    prismaMock.absenceRequest.update.mockResolvedValue({});

    const result = await cancelOwnRequestAction("req-1");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.absenceRequest.delete).not.toHaveBeenCalled();
    expect(prismaMock.absenceRequest.update).toHaveBeenCalledTimes(1);
    const call = prismaMock.absenceRequest.update.mock.calls[0][0] as {
      where: { id: string };
      data: {
        status: string;
        cancelledById: string;
        deletedAt: Date;
        archivedUntil: Date;
      };
    };
    expect(call.where).toEqual({ id: "req-1" });
    expect(call.data.status).toBe("CANCELLED");
    expect(call.data.cancelledById).toBe("emp-1");
    expect(call.data.deletedAt).toBeInstanceOf(Date);
    expect(call.data.archivedUntil).toEqual(
      archiveUntil(call.data.deletedAt),
    );

    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CANCEL",
        entityId: "req-1",
        newValue: {
          status: "CANCELLED",
          cancelledAt: call.data.deletedAt.toISOString(),
          cancelledById: "emp-1",
          deletedAt: call.data.deletedAt.toISOString(),
          archivedUntil: call.data.archivedUntil.toISOString(),
        },
      }),
    );
  });

  it("rejects when the request is already soft-deleted", async () => {
    prismaMock.absenceRequest.findUnique.mockResolvedValue({
      id: "req-1",
      tenantId: "tenant-a",
      employeeId: "emp-1",
      status: "OPEN",
      type: "VACATION",
      startDate: new Date(),
      endDate: new Date(),
      deletedAt: new Date(),
    });

    const result = await cancelOwnRequestAction("req-1");

    expect(result.ok).toBe(false);
    expect(prismaMock.absenceRequest.update).not.toHaveBeenCalled();
  });
});

describe("cancelled AbsenceRequest data retention queries", () => {
  let db: TestDb;

  beforeAll(() => {
    db = makeTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.reset();
  });

  it("excludes soft-deleted rows from the active list and includes them in purge after retention", async () => {
    const locationId = await seedLocation(db.prisma, "Cancel Retention Loc");
    const { id: employeeId, tenantId } = await seedEmployee(db.prisma, {
      locationId,
    });
    const row = await db.prisma.absenceRequest.create({
      data: {
        tenantId,
        employeeId,
        type: "VACATION",
        startDate: new Date("2026-06-01T00:00:00.000Z"),
        endDate: new Date("2026-06-03T00:00:00.000Z"),
        status: "OPEN",
      },
    });

    const now = new Date("2026-04-15T12:00:00.000Z");
    const until = archiveUntil(now);
    await db.prisma.absenceRequest.update({
      where: { id: row.id },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledById: employeeId,
        deletedAt: now,
        archivedUntil: until,
      },
    });

    const active = await db.prisma.absenceRequest.findMany({
      where: { employeeId, tenantId, deletedAt: null },
    });
    expect(active).toHaveLength(0);

    const archived = await db.prisma.absenceRequest.findMany({
      where: { employeeId, tenantId, deletedAt: { not: null } },
    });
    expect(archived).toHaveLength(1);
    expect(archived[0]?.status).toBe("CANCELLED");

    const dryBefore = await purgeArchivedData(db.prisma, {
      allTenants: true,
      dryRun: true,
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    expect(dryBefore.candidates.absenceRequests).toBe(0);

    const dryAfter = await purgeArchivedData(db.prisma, {
      allTenants: true,
      dryRun: true,
      now: new Date("2037-01-01T00:00:00.000Z"),
    });
    expect(dryAfter.candidates.absenceRequests).toBe(1);
  });
});
