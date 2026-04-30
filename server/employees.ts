"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  requireAdmin,
  fieldErrorsFromZod,
  readOptionalString,
  readBooleanFlag,
  safeRevalidatePath,
  type ActionResult,
} from "./_shared";
import { applyEmployeeOpeningBalances } from "@/lib/bookings/core";
import { archiveUntil } from "@/lib/archive";
import {
  buildExitSnapshot,
  exitDateChangeTriggersSnapshot,
  isExitDateInPast,
} from "@/lib/employee/exit-snapshot";

type EmployeeStatus = "AKTIV" | "INAKTIV" | "AUSGETRETEN" | "ARCHIVIERT";

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function resolveEmployeeStatus(input: {
  isActive: boolean;
  exitDate: Date | null;
  deletedAt: Date | null;
}): EmployeeStatus {
  if (input.deletedAt) return "ARCHIVIERT";
  if (input.exitDate && input.exitDate <= startOfToday()) return "AUSGETRETEN";
  if (!input.isActive) return "INAKTIV";
  return "AKTIV";
}

function openingAmountSchema(maxAbs: number) {
  return z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }, z.number().finite().min(-maxAbs).max(maxAbs));
}

const minuteFieldsRequired = {
  weeklyTargetMinutes: z.coerce
    .number()
    .int("Ganzzahl erforderlich")
    .min(0, "Mindestens 0")
    .max(7200, "Maximal 7200"),
  hazMinutesPerWeek: z.coerce
    .number()
    .int("Ganzzahl erforderlich")
    .min(0, "Mindestens 0")
    .max(7200, "Maximal 7200"),
};

function optionalMinutesForCreate() {
  return z.preprocess(
    (raw) => {
      if (raw === "" || raw === null || raw === undefined) return undefined;
      const n = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(n) ? n : raw;
    },
    z
      .number()
      .int("Ganzzahl erforderlich")
      .min(0, "Mindestens 0")
      .max(7200, "Maximal 7200")
      .optional(),
  );
}

const optionalWeeklyTarget = optionalMinutesForCreate();
const optionalHazMinutes = optionalMinutesForCreate();

function optionalPeriodicQuotaDays() {
  return z.preprocess((raw) => {
    if (raw === "" || raw === null || raw === undefined) return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : raw;
  }, z.union([z.null(), z.number().positive().max(366)]));
}

function optionalPeriodicMonths() {
  return z.preprocess((raw) => {
    if (raw === "" || raw === null || raw === undefined) return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : raw;
  }, z.union([z.null(), z.literal(1), z.literal(3), z.literal(6), z.literal(12)]));
}

const employeeCoreSchema = z
  .object({
    firstName: z.string().min(1, "Vorname erforderlich"),
    lastName: z.string().min(1, "Nachname erforderlich"),
    roleLabel: z
      .string()
      .max(60, "Maximal 60 Zeichen")
      .optional()
      .nullable(),
    pensum: z.coerce
      .number()
      .int("Ganzzahl erforderlich")
      .min(0, "Pensum 0–100")
      .max(100, "Pensum 0–100"),
    entryDate: z.coerce.date({ message: "Eintrittsdatum erforderlich" }),
    exitDate: z.coerce.date().nullable().optional(),
    locationId: z.string().min(1, "Standort wählen"),
    vacationDaysPerYear: z.coerce
      .number()
      .min(0, "Mindestens 0")
      .max(60, "Maximal 60"),
    tztModel: z.enum(["DAILY_QUOTA", "TARGET_REDUCTION"], {
      message: "TZT-Modell wählen",
    }),
    tztPeriodicQuotaDays: optionalPeriodicQuotaDays(),
    tztPeriodMonths: optionalPeriodicMonths(),
    standardWorkDays: z.preprocess(
      (raw) => {
        if (raw === "" || raw === null || raw === undefined) return null;
        const n = typeof raw === "number" ? raw : Number(raw);
        return Number.isFinite(n) ? n : raw;
      },
      z.union([z.null(), z.number().int().min(1).max(7)]),
    ),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.tztModel !== "DAILY_QUOTA") return;
    const q = data.tztPeriodicQuotaDays;
    const p = data.tztPeriodMonths;
    const hasQ = q != null && q > 0;
    const hasP = p != null;
    if (hasQ !== hasP) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "TZT-Tage je Periode und Rhythmus sind beide erforderlich (oder beide leer).",
        path: ["tztPeriodicQuotaDays"],
      });
    }
  });

const createSchema = employeeCoreSchema.extend({
  email: z.string().email("E-Mail erforderlich"),
  password: z.string().min(6, "Mindestens 6 Zeichen"),
  weeklyTargetMinutes: optionalWeeklyTarget,
  hazMinutesPerWeek: optionalHazMinutes,
  openingZeitsaldoMinutes: openingAmountSchema(500_000),
  openingUezMinutes: openingAmountSchema(500_000),
  openingVacationDays: openingAmountSchema(366),
  openingTztDays: openingAmountSchema(366),
  openingParentalCareDays: openingAmountSchema(366),
});

const updateSchema = employeeCoreSchema.extend({
  id: z.string().min(1),
  email: z.string().email("E-Mail erforderlich"),
  password: z
    .string()
    .min(6, "Mindestens 6 Zeichen")
    .optional()
    .or(z.literal("")),
}).extend(minuteFieldsRequired);

function rawFromForm(formData: FormData): Record<string, unknown> {
  const exit = readOptionalString(formData.get("exitDate"));
  return {
    id: readOptionalString(formData.get("id")) ?? undefined,
    email: readOptionalString(formData.get("email")) ?? "",
    password: readOptionalString(formData.get("password")) ?? "",
    firstName: readOptionalString(formData.get("firstName")) ?? "",
    lastName: readOptionalString(formData.get("lastName")) ?? "",
    roleLabel: readOptionalString(formData.get("roleLabel")),
    pensum: formData.get("pensum"),
    entryDate: readOptionalString(formData.get("entryDate")),
    exitDate: exit,
    locationId: readOptionalString(formData.get("locationId")) ?? "",
    vacationDaysPerYear: formData.get("vacationDaysPerYear"),
    weeklyTargetMinutes: formData.get("weeklyTargetMinutes"),
    hazMinutesPerWeek: formData.get("hazMinutesPerWeek"),
    tztModel: readOptionalString(formData.get("tztModel")) ?? "DAILY_QUOTA",
    tztPeriodicQuotaDays: formData.get("tztPeriodicQuotaDays"),
    tztPeriodMonths: formData.get("tztPeriodMonths"),
    standardWorkDays: formData.get("standardWorkDays"),
    isActive: readBooleanFlag(formData.get("isActive")),
    openingZeitsaldoMinutes: formData.get("openingZeitsaldoMinutes"),
    openingUezMinutes: formData.get("openingUezMinutes"),
    openingVacationDays: formData.get("openingVacationDays"),
    openingTztDays: formData.get("openingTztDays"),
    openingParentalCareDays: formData.get("openingParentalCareDays"),
  };
}

function resolvePeriodicTztFields(
  data: z.infer<typeof employeeCoreSchema>,
  priorLastGranted: Date | null | undefined,
): {
  tztPeriodicQuotaDays: number | null;
  tztPeriodMonths: number | null;
  tztLastGrantedAt: Date | null;
} {
  const activeDaily =
    data.tztModel === "DAILY_QUOTA" &&
    data.tztPeriodicQuotaDays != null &&
    data.tztPeriodicQuotaDays > 0 &&
    data.tztPeriodMonths != null;

  return {
    tztPeriodicQuotaDays: activeDaily ? data.tztPeriodicQuotaDays : null,
    tztPeriodMonths: activeDaily ? data.tztPeriodMonths : null,
    tztLastGrantedAt: activeDaily ? priorLastGranted ?? null : null,
  };
}

export async function createEmployeeAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = createSchema.safeParse(rawFromForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;
  const emailLower = data.email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: emailLower },
  });
  if (existing) {
    return {
      ok: false,
      error: "E-Mail bereits vergeben.",
      fieldErrors: { email: "Diese E-Mail ist bereits registriert." },
    };
  }

  const location = await prisma.location.findUnique({
    where: { id: data.locationId },
    select: { tenantId: true, deletedAt: true },
  });
  if (!location || location.tenantId !== admin.tenantId || location.deletedAt) {
    return {
      ok: false,
      error: "Standort nicht gefunden.",
      fieldErrors: { locationId: "Standort nicht gefunden." },
    };
  }

  const tenantDefaults = await prisma.tenant.findUnique({
    where: { id: admin.tenantId },
    select: {
      defaultWeeklyTargetMinutes: true,
      defaultHazMinutesPerWeek: true,
    },
  });
  const resolvedWeeklyTargetMinutes =
    data.weeklyTargetMinutes ??
    tenantDefaults?.defaultWeeklyTargetMinutes ??
    2520;
  const resolvedHazMinutesPerWeek =
    data.hazMinutesPerWeek ??
    tenantDefaults?.defaultHazMinutesPerWeek ??
    2700;

  const passwordHash = await bcrypt.hash(data.password, 10);
  const exitDate = data.exitDate ?? null;
  const employeeStatus = resolveEmployeeStatus({
    isActive: data.isActive,
    exitDate,
    deletedAt: null,
  });

  const { openingBookingsCreated, employee } = await prisma.$transaction(
    async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: admin.tenantId,
          email: emailLower,
          passwordHash,
          role: "EMPLOYEE",
          isActive: data.isActive,
        },
      });

      const periodic = resolvePeriodicTztFields(data, null);

      const emp = await tx.employee.create({
        data: {
          tenantId: admin.tenantId,
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          roleLabel: data.roleLabel ?? null,
          pensum: data.pensum,
          entryDate: data.entryDate,
          exitDate: data.exitDate ?? null,
          locationId: data.locationId,
          vacationDaysPerYear: data.vacationDaysPerYear,
          weeklyTargetMinutes: resolvedWeeklyTargetMinutes,
          hazMinutesPerWeek: resolvedHazMinutesPerWeek,
          tztModel: data.tztModel,
          ...periodic,
          standardWorkDays: data.standardWorkDays,
          isActive: data.isActive,
          status: employeeStatus,
          deletedAt: null,
          archivedUntil: null,
        },
      });

      const openingBookingsCreated = await applyEmployeeOpeningBalances(tx, {
        employeeId: emp.id,
        tenantId: admin.tenantId,
        vacationDaysPerYear: data.vacationDaysPerYear,
        entryDate: data.entryDate,
        createdByUserId: admin.id,
        openings: {
          ZEITSALDO: data.openingZeitsaldoMinutes,
          UEZ: data.openingUezMinutes,
          FERIEN: data.openingVacationDays,
          TZT: data.openingTztDays,
          PARENTAL_CARE: data.openingParentalCareDays,
        },
      });

      return { employee: emp, openingBookingsCreated };
    },
  );

  await writeAudit({
    userId: admin.id,
    action: "CREATE",
    entity: "Employee",
    entityId: employee.id,
    newValue: {
      email: emailLower,
      firstName: employee.firstName,
      lastName: employee.lastName,
      roleLabel: employee.roleLabel,
      pensum: employee.pensum,
      locationId: employee.locationId,
      vacationDaysPerYear: employee.vacationDaysPerYear,
      weeklyTargetMinutes: employee.weeklyTargetMinutes,
      hazMinutesPerWeek: employee.hazMinutesPerWeek,
      tztModel: employee.tztModel,
      tztPeriodicQuotaDays: employee.tztPeriodicQuotaDays,
      tztPeriodMonths: employee.tztPeriodMonths,
      standardWorkDays: employee.standardWorkDays,
      isActive: employee.isActive,
      openingBookingsCreated,
    },
  });

  const openingValues = {
    zeitsaldoMinutes: data.openingZeitsaldoMinutes,
    uezMinutes: data.openingUezMinutes,
    vacationDays: data.openingVacationDays,
    tztDays: data.openingTztDays,
    parentalCareDays: data.openingParentalCareDays,
  };
  const hasOpeningValues = Object.values(openingValues).some((v) => v !== 0);
  if (hasOpeningValues || openingBookingsCreated > 0) {
    await writeAudit({
      userId: admin.id,
      action: "OPENING_BALANCES",
      entity: "Employee",
      entityId: employee.id,
      newValue: {
        ...openingValues,
        bookingsCreated: openingBookingsCreated,
        effectiveDate: data.entryDate.toISOString(),
      },
    });
  }

  safeRevalidatePath("createEmployeeAction", "/employees");
  safeRevalidatePath("createEmployeeAction", "/accounts");
  safeRevalidatePath("createEmployeeAction", "/my-accounts");
  safeRevalidatePath("createEmployeeAction", "/", "layout");
  return { ok: true };
}

export async function updateEmployeeAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = updateSchema.safeParse(rawFromForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const data = parsed.data;
  const emailLower = data.email.toLowerCase();

  const before = await prisma.employee.findUnique({
    where: { id: data.id },
    include: {
      user: { select: { id: true, email: true, isActive: true, role: true } },
    },
  });
  if (!before) {
    return { ok: false, error: "Mitarbeitende:r nicht gefunden." };
  }
  if (before.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diese:n Mitarbeitende:n." };
  }

  if (emailLower !== before.user.email) {
    const clash = await prisma.user.findUnique({
      where: { email: emailLower },
    });
    if (clash && clash.id !== before.userId) {
      return {
        ok: false,
        error: "E-Mail bereits vergeben.",
        fieldErrors: { email: "Diese E-Mail ist bereits registriert." },
      };
    }
  }

  const location = await prisma.location.findUnique({
    where: { id: data.locationId },
    select: { tenantId: true, deletedAt: true },
  });
  if (!location || location.tenantId !== admin.tenantId || location.deletedAt) {
    return {
      ok: false,
      error: "Standort nicht gefunden.",
      fieldErrors: { locationId: "Standort nicht gefunden." },
    };
  }

  const isOwnEmployee =
    admin.employeeId != null && admin.employeeId === data.id;
  if (isOwnEmployee) {
    const wouldDeactivate = !data.isActive;
    const wouldDemoteToEmployee = before.user.role !== "EMPLOYEE";
    if (wouldDeactivate || wouldDemoteToEmployee) {
      const activeAdminCount = await prisma.user.count({
        where: {
          tenantId: admin.tenantId,
          role: "ADMIN",
          isActive: true,
        },
      });
      if (activeAdminCount === 1) {
        return {
          ok: false,
          error:
            "Als einzigem aktiven Admin können Sie sich nicht deaktivieren oder die Admin-Rolle entziehen.",
        };
      }
    }
  }

  const passwordHash =
    data.password && data.password.length > 0
      ? await bcrypt.hash(data.password, 10)
      : undefined;
  const nextExitDate = data.exitDate ?? null;
  const nextDeletedAt = data.isActive ? null : (before.deletedAt ?? new Date());
  const nextArchivedUntil = data.isActive
    ? null
    : (before.archivedUntil ?? archiveUntil(nextDeletedAt ?? undefined));
  const nextDeletedById = data.isActive ? null : (before.deletedById ?? admin.id);
  const nextStatus = resolveEmployeeStatus({
    isActive: data.isActive,
    exitDate: nextExitDate,
    deletedAt: nextDeletedAt,
  });

  const periodicUpdate = resolvePeriodicTztFields(data, before.tztLastGrantedAt);

  const { updated, exitSnapshotId } = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: before.userId },
      data: {
        email: emailLower,
        isActive: data.isActive,
        role: "EMPLOYEE",
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    const updatedEmployee = await tx.employee.update({
      where: { id: data.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        roleLabel: data.roleLabel ?? null,
        pensum: data.pensum,
        entryDate: data.entryDate,
        exitDate: nextExitDate,
        locationId: data.locationId,
        vacationDaysPerYear: data.vacationDaysPerYear,
        weeklyTargetMinutes: data.weeklyTargetMinutes,
        hazMinutesPerWeek: data.hazMinutesPerWeek,
        tztModel: data.tztModel,
        ...periodicUpdate,
        standardWorkDays: data.standardWorkDays,
        isActive: data.isActive,
        status: nextStatus,
        deletedAt: nextDeletedAt,
        archivedUntil: nextArchivedUntil,
        deletedById: nextDeletedById,
      },
    });

    const nextExit = nextExitDate;
    const existingSnap = await tx.employeeExitSnapshot.findUnique({
      where: { employeeId: data.id },
      select: { id: true },
    });
    let createdSnapshotId: string | undefined;
    if (
      !existingSnap &&
      nextExit &&
      isExitDateInPast(nextExit) &&
      exitDateChangeTriggersSnapshot(before.exitDate, nextExit)
    ) {
      const { snapshotJson } = await buildExitSnapshot(tx, data.id);
      const snap = await tx.employeeExitSnapshot.create({
        data: {
          tenantId: admin.tenantId,
          employeeId: data.id,
          exitDate: nextExit,
          snapshotJson,
        },
      });
      createdSnapshotId = snap.id;
    }

    return { updated: updatedEmployee, exitSnapshotId: createdSnapshotId };
  });

  await writeAudit({
    userId: admin.id,
    action: "UPDATE",
    entity: "Employee",
    entityId: updated.id,
    oldValue: {
      email: before.user.email,
      firstName: before.firstName,
      lastName: before.lastName,
      roleLabel: before.roleLabel,
      pensum: before.pensum,
      locationId: before.locationId,
      vacationDaysPerYear: before.vacationDaysPerYear,
      weeklyTargetMinutes: before.weeklyTargetMinutes,
      hazMinutesPerWeek: before.hazMinutesPerWeek,
      tztModel: before.tztModel,
      tztPeriodicQuotaDays: before.tztPeriodicQuotaDays,
      tztPeriodMonths: before.tztPeriodMonths,
      tztLastGrantedAt: before.tztLastGrantedAt?.toISOString() ?? null,
      standardWorkDays: before.standardWorkDays,
      isActive: before.isActive,
      passwordChanged: false,
    },
    newValue: {
      email: emailLower,
      firstName: updated.firstName,
      lastName: updated.lastName,
      roleLabel: updated.roleLabel,
      pensum: updated.pensum,
      locationId: updated.locationId,
      vacationDaysPerYear: updated.vacationDaysPerYear,
      weeklyTargetMinutes: updated.weeklyTargetMinutes,
      hazMinutesPerWeek: updated.hazMinutesPerWeek,
      tztModel: updated.tztModel,
      tztPeriodicQuotaDays: updated.tztPeriodicQuotaDays,
      tztPeriodMonths: updated.tztPeriodMonths,
      tztLastGrantedAt: updated.tztLastGrantedAt?.toISOString() ?? null,
      standardWorkDays: updated.standardWorkDays,
      isActive: updated.isActive,
      passwordChanged: Boolean(passwordHash),
    },
  });

  if (before.user.role !== "EMPLOYEE") {
    await writeAudit({
      userId: admin.id,
      action: "ROLE_CHANGE",
      entity: "User",
      entityId: before.userId,
      oldValue: { role: before.user.role },
      newValue: { role: "EMPLOYEE" },
      comment: "Rolle bei Mitarbeiter-Update auf EMPLOYEE normalisiert.",
    });
  }

  if (exitSnapshotId) {
    await writeAudit({
      userId: admin.id,
      action: "EXIT_SNAPSHOT",
      entity: "Employee",
      entityId: updated.id,
      newValue: {
        employeeExitSnapshotId: exitSnapshotId,
        exitDate: updated.exitDate!.toISOString(),
      },
    });
  }

  safeRevalidatePath("updateEmployeeAction", "/employees");
  safeRevalidatePath("updateEmployeeAction", "/", "layout");
  return { ok: true };
}

export async function setEmployeeActiveAction(
  employeeId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const before = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: { select: { id: true, isActive: true } } },
  });
  if (!before) {
    return { ok: false, error: "Mitarbeitende:r nicht gefunden." };
  }
  if (before.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diese:n Mitarbeitende:n." };
  }

  if (!isActive && before.user.id === admin.id) {
    return {
      ok: false,
      error: "Du kannst dich nicht selbst deaktivieren.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: before.userId },
      data: { isActive },
    });
    await tx.employee.update({
      where: { id: employeeId },
      data: {
        isActive,
        status: resolveEmployeeStatus({
          isActive,
          exitDate: before.exitDate,
          deletedAt: before.deletedAt,
        }),
      },
    });
  });

  await writeAudit({
    userId: admin.id,
    action: isActive ? "ACTIVATE" : "DEACTIVATE",
    entity: "Employee",
    entityId: employeeId,
    oldValue: { isActive: before.isActive },
    newValue: {
      isActive,
      status: resolveEmployeeStatus({
        isActive,
        exitDate: before.exitDate,
        deletedAt: before.deletedAt,
      }),
    },
  });

  safeRevalidatePath("setEmployeeActiveAction", "/employees");
  safeRevalidatePath("setEmployeeActiveAction", "/", "layout");
  return { ok: true };
}

export async function setUserLockAction(
  employeeId: string,
  locked: boolean,
  reason?: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const before = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: {
        select: { id: true, isActive: true },
      },
    },
  });
  if (!before) {
    return { ok: false, error: "Mitarbeitende:r nicht gefunden." };
  }
  if (before.tenantId !== admin.tenantId) {
    return { ok: false, error: "Kein Zugriff auf diese:n Mitarbeitende:n." };
  }

  if (locked && before.userId === admin.id) {
    return { ok: false, error: "Du kannst dich nicht selbst sperren." };
  }

  const trimmedReason = reason?.trim();
  if (locked && (!trimmedReason || trimmedReason.length < 3)) {
    return {
      ok: false,
      error: "Bitte Sperrgrund mit mindestens 3 Zeichen angeben.",
    };
  }

  const userIsActive = !locked;
  await prisma.user.update({
    where: { id: before.userId },
    data: { isActive: userIsActive },
  });

  await writeAudit({
    userId: admin.id,
    action: locked ? "LOCK_USER" : "UNLOCK_USER",
    entity: "User",
    entityId: before.userId,
    oldValue: {
      userIsActive: before.user.isActive,
      employeeIsActive: before.isActive,
    },
    newValue: {
      userIsActive,
      employeeIsActive: before.isActive,
    },
    comment: trimmedReason ?? null,
  });

  safeRevalidatePath("setUserLockAction", "/employees");
  safeRevalidatePath("setUserLockAction", "/", "layout");
  return { ok: true };
}
