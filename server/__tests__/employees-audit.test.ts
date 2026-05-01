import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  safeRevalidatePathMock,
  applyEmployeeOpeningBalancesMock,
  writeAuditMock,
  bcryptHashMock,
  prismaMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  safeRevalidatePathMock: vi.fn(),
  applyEmployeeOpeningBalancesMock: vi.fn(),
  writeAuditMock: vi.fn(),
  bcryptHashMock: vi.fn(),
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    employee: {
      findUnique: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: bcryptHashMock },
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: writeAuditMock,
}));

vi.mock("@/lib/bookings/core", () => ({
  applyEmployeeOpeningBalances: applyEmployeeOpeningBalancesMock,
}));

vi.mock("@/server/_shared", () => ({
  requireAdmin: requireAdminMock,
  safeRevalidatePath: safeRevalidatePathMock,
  fieldErrorsFromZod: vi.fn(),
  readOptionalString: (v: FormDataEntryValue | null) =>
    typeof v === "string" ? v : null,
  readBooleanFlag: (v: FormDataEntryValue | null) =>
    v === "true" || v === "on" || v === "1",
}));

function txEmployeeUpdate(employeeResult: Record<string, unknown>) {
  return {
    user: {
      update: vi.fn().mockResolvedValue({ id: "user-1" }),
    },
    employee: {
      update: vi.fn().mockResolvedValue(employeeResult),
    },
    employeeExitSnapshot: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    accountBalance: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ertCase: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    compensationCase: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

import { createEmployeeAction, updateEmployeeAction } from "@/server/employees";

function buildCreateFormData(): FormData {
  const fd = new FormData();
  fd.set("email", "new.employee@example.com");
  fd.set("password", "secret12");
  fd.set("firstName", "Nina");
  fd.set("lastName", "Test");
  fd.set("roleLabel", "Verkauf");
  fd.set("pensum", "100");
  fd.set("entryDate", "2026-03-02");
  fd.set("locationId", "loc-1");
  fd.set("vacationDaysPerYear", "25");
  fd.set("weeklyTargetMinutes", "2520");
  fd.set("hazMinutesPerWeek", "2700");
  fd.set("tztModel", "DAILY_QUOTA");
  fd.set("isActive", "on");
  fd.set("openingZeitsaldoMinutes", "120");
  fd.set("openingUezMinutes", "0");
  fd.set("openingVacationDays", "0");
  fd.set("openingTztDays", "0");
  fd.set("openingParentalCareDays", "0");
  return fd;
}

function buildUpdateFormData(): FormData {
  const fd = new FormData();
  fd.set("id", "emp-1");
  fd.set("email", "employee@example.com");
  fd.set("firstName", "Eva");
  fd.set("lastName", "Example");
  fd.set("roleLabel", "Service");
  fd.set("pensum", "80");
  fd.set("entryDate", "2026-01-01");
  fd.set("locationId", "loc-1");
  fd.set("vacationDaysPerYear", "25");
  fd.set("weeklyTargetMinutes", "2016");
  fd.set("hazMinutesPerWeek", "2700");
  fd.set("tztModel", "DAILY_QUOTA");
  fd.set("isActive", "on");
  return fd;
}

function buildDeactivateFormData(): FormData {
  const fd = buildUpdateFormData();
  fd.delete("isActive");
  return fd;
}

describe("employees audit coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ id: "admin-1", tenantId: "tenant-a" });
    bcryptHashMock.mockResolvedValue("hashed");
    writeAuditMock.mockResolvedValue(undefined);
    applyEmployeeOpeningBalancesMock.mockResolvedValue(1);
    prismaMock.location.findUnique.mockResolvedValue({ tenantId: "tenant-a" });
    prismaMock.tenant.findUnique.mockResolvedValue({
      defaultWeeklyTargetMinutes: 2520,
      defaultHazMinutesPerWeek: 2700,
      defaultStandardWorkDays: 5,
    });
  });

  it("writes a dedicated OPENING_BALANCES audit on employee creation", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb) =>
      cb({
        user: {
          create: vi.fn().mockResolvedValue({ id: "user-1" }),
        },
        employee: {
          create: vi.fn().mockResolvedValue({
            id: "emp-1",
            firstName: "Nina",
            lastName: "Test",
            roleLabel: "Verkauf",
            pensum: 100,
            locationId: "loc-1",
            vacationDaysPerYear: 25,
            weeklyTargetMinutes: 2520,
            hazMinutesPerWeek: 2700,
            tztModel: "DAILY_QUOTA",
            tztPeriodicQuotaDays: null,
            tztPeriodMonths: null,
            tztLastGrantedAt: null,
            isActive: true,
          }),
        },
      }),
    );

    const result = await createEmployeeAction(undefined, buildCreateFormData());

    expect(result.ok).toBe(true);
    expect(writeAuditMock).toHaveBeenCalledTimes(2);
    expect(
      writeAuditMock.mock.calls.some(
        ([payload]) =>
          payload.action === "OPENING_BALANCES" &&
          payload.entity === "Employee" &&
          payload.entityId === "emp-1" &&
          payload.newValue?.zeitsaldoMinutes === 120,
      ),
    ).toBe(true);
  });

  it("converts openingVacationDays to minutes for FERIEN openings", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb) =>
      cb({
        user: {
          create: vi.fn().mockResolvedValue({ id: "user-1" }),
        },
        employee: {
          create: vi.fn().mockResolvedValue({
            id: "emp-1",
            firstName: "Nina",
            lastName: "Test",
            roleLabel: "Verkauf",
            pensum: 100,
            locationId: "loc-1",
            vacationDaysPerYear: 25,
            weeklyTargetMinutes: 2520,
            hazMinutesPerWeek: 2700,
            tztModel: "DAILY_QUOTA",
            tztPeriodicQuotaDays: null,
            tztPeriodMonths: null,
            tztLastGrantedAt: null,
            isActive: true,
          }),
        },
      }),
    );

    const fd = buildCreateFormData();
    fd.set("openingVacationDays", "5");
    const result = await createEmployeeAction(undefined, fd);

    expect(result.ok).toBe(true);
    expect(applyEmployeeOpeningBalancesMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        openings: expect.objectContaining({
          FERIEN: 2520,
        }),
      }),
    );
  });

  it("writes ROLE_CHANGE audit when user role is normalized on update", async () => {
    prismaMock.employee.findUnique.mockResolvedValue({
      id: "emp-1",
      tenantId: "tenant-a",
      userId: "user-1",
      firstName: "Eva",
      lastName: "Example",
      roleLabel: "Service",
      pensum: 80,
      locationId: "loc-1",
      vacationDaysPerYear: 25,
      weeklyTargetMinutes: 2016,
      hazMinutesPerWeek: 2700,
      tztModel: "DAILY_QUOTA",
      tztPeriodicQuotaDays: null,
      tztPeriodMonths: null,
      tztLastGrantedAt: null,
      isActive: true,
      exitDate: null,
      user: { id: "user-1", email: "employee@example.com", isActive: true, role: "ADMIN" },
    });
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb) =>
      cb(
        txEmployeeUpdate({
          id: "emp-1",
          firstName: "Eva",
          lastName: "Example",
          roleLabel: "Service",
          pensum: 80,
          locationId: "loc-1",
          vacationDaysPerYear: 25,
          weeklyTargetMinutes: 2016,
          hazMinutesPerWeek: 2700,
          tztModel: "DAILY_QUOTA",
          tztPeriodicQuotaDays: null,
          tztPeriodMonths: null,
          tztLastGrantedAt: null,
          isActive: true,
        }),
      ),
    );

    const result = await updateEmployeeAction(undefined, buildUpdateFormData());

    expect(result.ok).toBe(true);
    expect(
      writeAuditMock.mock.calls.some(
        ([payload]) =>
          payload.action === "ROLE_CHANGE" &&
          payload.entity === "User" &&
          payload.entityId === "user-1" &&
          payload.oldValue?.role === "ADMIN" &&
          payload.newValue?.role === "EMPLOYEE",
      ),
    ).toBe(true);
  });

  it("sets INAKTIV without archive fields when employee is deactivated through edit", async () => {
    const employeeUpdate = vi.fn().mockResolvedValue({
      id: "emp-1",
      firstName: "Eva",
      lastName: "Example",
      roleLabel: "Service",
      pensum: 80,
      locationId: "loc-1",
      vacationDaysPerYear: 25,
      weeklyTargetMinutes: 2016,
      hazMinutesPerWeek: 2700,
      tztModel: "DAILY_QUOTA",
      tztPeriodicQuotaDays: null,
      tztPeriodMonths: null,
      tztLastGrantedAt: null,
      isActive: false,
      status: "INAKTIV",
    });
    prismaMock.employee.findUnique.mockResolvedValue({
      id: "emp-1",
      tenantId: "tenant-a",
      userId: "user-1",
      firstName: "Eva",
      lastName: "Example",
      roleLabel: "Service",
      pensum: 80,
      locationId: "loc-1",
      vacationDaysPerYear: 25,
      weeklyTargetMinutes: 2016,
      hazMinutesPerWeek: 2700,
      tztModel: "DAILY_QUOTA",
      tztPeriodicQuotaDays: null,
      tztPeriodMonths: null,
      tztLastGrantedAt: null,
      isActive: true,
      deletedAt: null,
      archivedUntil: null,
      deletedById: null,
      exitDate: null,
      user: { id: "user-1", email: "employee@example.com", isActive: true, role: "EMPLOYEE" },
    });
    prismaMock.$transaction.mockImplementation(async (cb) =>
      cb({
        user: {
          update: vi.fn().mockResolvedValue({ id: "user-1" }),
        },
        employee: {
          update: employeeUpdate,
        },
        employeeExitSnapshot: {
          findUnique: vi.fn().mockResolvedValue({ id: "snap-existing" }),
        },
        accountBalance: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        ertCase: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        compensationCase: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      }),
    );

    const result = await updateEmployeeAction(undefined, buildDeactivateFormData());

    expect(result.ok).toBe(true);
    expect(employeeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          status: "INAKTIV",
          deletedAt: null,
          archivedUntil: null,
          deletedById: null,
        }),
      }),
    );
  });

  it("derives AUSGETRETEN from past exitDate when deactivated", async () => {
    const employeeUpdate = vi.fn().mockResolvedValue({
      id: "emp-1",
      firstName: "Eva",
      lastName: "Example",
      roleLabel: "Service",
      pensum: 80,
      locationId: "loc-1",
      vacationDaysPerYear: 25,
      weeklyTargetMinutes: 2016,
      hazMinutesPerWeek: 2700,
      tztModel: "DAILY_QUOTA",
      tztPeriodicQuotaDays: null,
      tztPeriodMonths: null,
      tztLastGrantedAt: null,
      isActive: false,
      status: "AUSGETRETEN",
    });
    prismaMock.employee.findUnique.mockResolvedValue({
      id: "emp-1",
      tenantId: "tenant-a",
      userId: "user-1",
      firstName: "Eva",
      lastName: "Example",
      roleLabel: "Service",
      pensum: 80,
      locationId: "loc-1",
      vacationDaysPerYear: 25,
      weeklyTargetMinutes: 2016,
      hazMinutesPerWeek: 2700,
      tztModel: "DAILY_QUOTA",
      tztPeriodicQuotaDays: null,
      tztPeriodMonths: null,
      tztLastGrantedAt: null,
      isActive: true,
      deletedAt: null,
      archivedUntil: null,
      deletedById: null,
      exitDate: null,
      user: { id: "user-1", email: "employee@example.com", isActive: true, role: "EMPLOYEE" },
    });
    prismaMock.$transaction.mockImplementation(async (cb) =>
      cb({
        user: {
          update: vi.fn().mockResolvedValue({ id: "user-1" }),
        },
        employee: {
          update: employeeUpdate,
        },
        employeeExitSnapshot: {
          findUnique: vi.fn().mockResolvedValue({ id: "snap-existing" }),
        },
        accountBalance: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        ertCase: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        compensationCase: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      }),
    );

    const fd = buildDeactivateFormData();
    fd.set("exitDate", "2020-01-01");
    const result = await updateEmployeeAction(undefined, fd);

    expect(result.ok).toBe(true);
    expect(employeeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isActive: false,
          status: "AUSGETRETEN",
          deletedAt: null,
          archivedUntil: null,
          deletedById: null,
        }),
      }),
    );
  });

  it("keeps archived employees archived on normal profile edits", async () => {
    const archivedAt = new Date("2026-01-01T00:00:00.000Z");
    const archivedUntil = new Date("2036-01-01T00:00:00.000Z");
    const employeeUpdate = vi.fn().mockResolvedValue({
      id: "emp-1",
      firstName: "Eva",
      lastName: "Example",
      roleLabel: "Service",
      pensum: 80,
      locationId: "loc-1",
      vacationDaysPerYear: 25,
      weeklyTargetMinutes: 2016,
      hazMinutesPerWeek: 2700,
      tztModel: "DAILY_QUOTA",
      tztPeriodicQuotaDays: null,
      tztPeriodMonths: null,
      tztLastGrantedAt: null,
      isActive: true,
      status: "ARCHIVIERT",
    });
    prismaMock.employee.findUnique.mockResolvedValue({
      id: "emp-1",
      tenantId: "tenant-a",
      userId: "user-1",
      firstName: "Eva",
      lastName: "Example",
      roleLabel: "Service",
      pensum: 80,
      locationId: "loc-1",
      vacationDaysPerYear: 25,
      weeklyTargetMinutes: 2016,
      hazMinutesPerWeek: 2700,
      tztModel: "DAILY_QUOTA",
      tztPeriodicQuotaDays: null,
      tztPeriodMonths: null,
      tztLastGrantedAt: null,
      isActive: false,
      deletedAt: archivedAt,
      archivedUntil,
      deletedById: "admin-1",
      exitDate: null,
      user: { id: "user-1", email: "employee@example.com", isActive: false, role: "EMPLOYEE" },
    });
    prismaMock.$transaction.mockImplementation(async (cb) =>
      cb({
        user: {
          update: vi.fn().mockResolvedValue({ id: "user-1" }),
        },
        employee: {
          update: employeeUpdate,
        },
        employeeExitSnapshot: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        accountBalance: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        ertCase: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        compensationCase: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      }),
    );

    const result = await updateEmployeeAction(undefined, buildUpdateFormData());

    expect(result.ok).toBe(true);
    expect(employeeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ARCHIVIERT",
          deletedAt: archivedAt,
          archivedUntil,
          deletedById: "admin-1",
        }),
      }),
    );
  });
});
