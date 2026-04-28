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

function openingAmountSchema(maxAbs: number) {
  return z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }, z.number().finite().min(-maxAbs).max(maxAbs));
}

const baseSchema = z.object({
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
  tztModel: z.enum(["DAILY_QUOTA", "TARGET_REDUCTION"], {
    message: "TZT-Modell wählen",
  }),
  isActive: z.boolean().default(true),
});

const createSchema = baseSchema.extend({
  email: z.string().email("E-Mail erforderlich"),
  password: z.string().min(6, "Mindestens 6 Zeichen"),
  openingZeitsaldoMinutes: openingAmountSchema(500_000),
  openingUezMinutes: openingAmountSchema(500_000),
  openingVacationDays: openingAmountSchema(366),
  openingTztDays: openingAmountSchema(366),
});

const updateSchema = baseSchema.extend({
  id: z.string().min(1),
  email: z.string().email("E-Mail erforderlich"),
  password: z
    .string()
    .min(6, "Mindestens 6 Zeichen")
    .optional()
    .or(z.literal("")),
});

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
    isActive: readBooleanFlag(formData.get("isActive")),
    openingZeitsaldoMinutes: formData.get("openingZeitsaldoMinutes"),
    openingUezMinutes: formData.get("openingUezMinutes"),
    openingVacationDays: formData.get("openingVacationDays"),
    openingTztDays: formData.get("openingTztDays"),
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
    where: { tenantId_email: { tenantId: admin.tenantId, email: emailLower } },
  });
  if (existing) {
    return {
      ok: false,
      error: "E-Mail bereits vergeben.",
      fieldErrors: { email: "E-Mail bereits vergeben." },
    };
  }

  const passwordHash = await bcrypt.hash(data.password, 10);

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
          weeklyTargetMinutes: data.weeklyTargetMinutes,
          hazMinutesPerWeek: data.hazMinutesPerWeek,
          tztModel: data.tztModel,
          isActive: data.isActive,
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
      isActive: employee.isActive,
      openingBookingsCreated,
    },
  });

  const openingValues = {
    zeitsaldoMinutes: data.openingZeitsaldoMinutes,
    uezMinutes: data.openingUezMinutes,
    vacationDays: data.openingVacationDays,
    tztDays: data.openingTztDays,
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
      where: { tenantId_email: { tenantId: admin.tenantId, email: emailLower } },
    });
    if (clash && clash.id !== before.userId) {
      return {
        ok: false,
        error: "E-Mail bereits vergeben.",
        fieldErrors: { email: "E-Mail bereits vergeben." },
      };
    }
  }

  const passwordHash =
    data.password && data.password.length > 0
      ? await bcrypt.hash(data.password, 10)
      : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: before.userId },
      data: {
        email: emailLower,
        isActive: data.isActive,
        role: "EMPLOYEE",
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    return tx.employee.update({
      where: { id: data.id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        roleLabel: data.roleLabel ?? null,
        pensum: data.pensum,
        entryDate: data.entryDate,
        exitDate: data.exitDate ?? null,
        locationId: data.locationId,
        vacationDaysPerYear: data.vacationDaysPerYear,
        weeklyTargetMinutes: data.weeklyTargetMinutes,
        hazMinutesPerWeek: data.hazMinutesPerWeek,
        tztModel: data.tztModel,
        isActive: data.isActive,
      },
    });
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

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: before.userId },
      data: { isActive },
    });
    await tx.employee.update({
      where: { id: employeeId },
      data: {
        isActive,
        deletedAt: isActive ? null : new Date(),
        archivedUntil: isActive ? null : archiveUntil(),
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
      deletedAt: isActive ? null : "set",
      archivedUntil: isActive ? null : "set",
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
