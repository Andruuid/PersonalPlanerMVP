import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { makeTestDb, type TestDb } from "@/lib/test/db";
import { seedEmployee, seedLocation } from "@/lib/test/fixtures";

const {
  prismaMock,
  requireEmployeeMock,
  writeAuditMock,
  safeRevalidatePathMock,
} = vi.hoisted(() => ({
  prismaMock: {
    absenceRequest: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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

import { withdrawRequestAction } from "@/server/requests";

describe("withdrawRequestAction", () => {
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

  it("sets WITHDRAWN for own open request", async () => {
    const start = new Date("2026-05-01T00:00:00.000Z");
    const end = new Date("2026-05-05T00:00:00.000Z");
    prismaMock.absenceRequest.findFirst.mockResolvedValue({
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

    const result = await withdrawRequestAction("req-1");

    expect(result).toEqual({ ok: true });
    expect(prismaMock.absenceRequest.delete).not.toHaveBeenCalled();
    expect(prismaMock.absenceRequest.update).toHaveBeenCalledTimes(1);
    const call = prismaMock.absenceRequest.update.mock.calls[0][0] as {
      where: { id: string };
      data: {
        status: string;
        cancelledById: string;
      };
    };
    expect(call.where).toEqual({ id: "req-1" });
    expect(call.data.status).toBe("WITHDRAWN");
    expect(call.data.cancelledById).toBe("emp-1");

    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WITHDRAW",
        entityId: "req-1",
        newValue: {
          status: "WITHDRAWN",
          cancelledAt: expect.any(String),
          cancelledById: "emp-1",
        },
      }),
    );
  });

  it("rejects when the request is already soft-deleted", async () => {
    // findFirst with `deletedAt: null` filter returns no row for soft-deleted
    // requests in real Prisma. Mock null directly.
    prismaMock.absenceRequest.findFirst.mockResolvedValue(null);

    const result = await withdrawRequestAction("req-1");

    expect(result.ok).toBe(false);
    expect(prismaMock.absenceRequest.update).not.toHaveBeenCalled();
  });
});

describe("withdrawn AbsenceRequest visibility", () => {
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

  it("keeps withdrawn rows visible in active list", async () => {
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
    await db.prisma.absenceRequest.update({
      where: { id: row.id },
      data: {
        status: "WITHDRAWN",
        cancelledAt: now,
        cancelledById: employeeId,
      },
    });

    const active = await db.prisma.absenceRequest.findMany({
      where: { employeeId, tenantId, deletedAt: null },
    });
    expect(active).toHaveLength(1);
    expect(active[0]?.status).toBe("WITHDRAWN");
  });
});
