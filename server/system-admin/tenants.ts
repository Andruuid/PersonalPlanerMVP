"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { softDeleteFields } from "@/lib/archive";
import { prisma } from "@/lib/db";
import { writeAuditCore } from "@/lib/audit/core";
import {
  fieldErrorsFromZod,
  readOptionalString,
  requireSystemAdmin,
  safeRevalidatePath,
  type ActionResult,
} from "@/server/_shared";

const createTenantSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich").max(200),
  slug: z
    .string()
    .trim()
    .min(2, "Slug muss mindestens 2 Zeichen haben")
    .max(64, "Slug darf maximal 64 Zeichen haben")
    .transform((v) => v.toLowerCase())
    .refine((v) => /^[a-z0-9-]+$/.test(v), {
      message: "Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.",
    }),
  defaultWeeklyTargetMinutes: z.coerce
    .number()
    .int()
    .min(60, "Default-Sollzeit muss mindestens 60 Minuten sein.")
    .max(6000, "Default-Sollzeit ist zu hoch."),
  defaultHazMinutesPerWeek: z.coerce
    .number()
    .int()
    .min(60, "Default-HAZ muss mindestens 60 Minuten sein.")
    .max(6000, "Default-HAZ ist zu hoch."),
  adminEmail: z.string().trim().email("Gültige E-Mail für den Kunden-Admin erforderlich."),
});

const updateTenantSchema = z.object({
  tenantId: z.string().trim().min(1),
  name: z.string().trim().min(1, "Name ist erforderlich").max(200),
  slug: z
    .string()
    .trim()
    .min(2, "Slug muss mindestens 2 Zeichen haben")
    .max(64, "Slug darf maximal 64 Zeichen haben")
    .transform((v) => v.toLowerCase())
    .refine((v) => /^[a-z0-9-]+$/.test(v), {
      message: "Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.",
    }),
  defaultWeeklyTargetMinutes: z.coerce.number().int().min(60).max(6000),
  defaultHazMinutesPerWeek: z.coerce.number().int().min(60).max(6000),
});

function generateTemporaryPassword(): string {
  const token = randomBytes(12).toString("base64url");
  return `Tmp-${token}`;
}

export interface SystemAdminTenantRow {
  id: string;
  name: string;
  slug: string;
  status: "AKTIV" | "DEAKTIVIERT" | "ARCHIVIERT";
  employeeCount: number;
  lastActivityAt: string | null;
}

export interface TenantDetailStats {
  employeeCount: number;
  weekCount: number;
  storageBytesEstimated: number;
}

export interface SystemAdminTenantDetail {
  id: string;
  name: string;
  slug: string;
  deletedAt: string | null;
  archivedUntil: string | null;
  defaultWeeklyTargetMinutes: number;
  defaultHazMinutesPerWeek: number;
  createdAt: string;
  stats: TenantDetailStats;
  initialAdminEmail: string | null;
}

function resolveTenantStatus(input: {
  deletedAt: Date | null;
  archivedUntil: Date | null;
}): SystemAdminTenantRow["status"] {
  if (input.archivedUntil) return "ARCHIVIERT";
  if (input.deletedAt) return "DEAKTIVIERT";
  return "AKTIV";
}

function estimateStorageBytes(stats: { employees: number; weeks: number; bookings: number }): number {
  return stats.employees * 1200 + stats.weeks * 900 + stats.bookings * 500;
}

export async function listSystemAdminTenants(): Promise<SystemAdminTenantRow[]> {
  await requireSystemAdmin();
  // SYSTEM_ADMIN scope intentionally spans all tenants.
  // eslint-disable-next-line tenant/require-prisma-where
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      deletedAt: true,
      archivedUntil: true,
      _count: { select: { employees: true } },
    },
  });

  const tenantIds = tenants.map((t) => t.id);
  const lastActivities = tenantIds.length
    ? await prisma.auditLog.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds } },
        _max: { createdAt: true },
      })
    : [];
  const activityMap = new Map(lastActivities.map((row) => [row.tenantId, row._max.createdAt]));

  return tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: resolveTenantStatus(tenant),
    employeeCount: tenant._count.employees,
    lastActivityAt: activityMap.get(tenant.id)?.toISOString() ?? null,
  }));
}

export async function getSystemAdminTenantDetail(
  tenantId: string,
): Promise<SystemAdminTenantDetail | null> {
  await requireSystemAdmin();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      deletedAt: true,
      archivedUntil: true,
      defaultWeeklyTargetMinutes: true,
      defaultHazMinutesPerWeek: true,
    },
  });
  if (!tenant) return null;

  const [employeeCount, weekCount, bookingCount, initialAdmin] = await Promise.all([
    prisma.employee.count({ where: { tenantId } }),
    prisma.week.count({ where: { tenantId } }),
    prisma.booking.count({ where: { tenantId } }),
    prisma.user.findFirst({
      where: { tenantId, role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { email: true },
    }),
  ]);

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    createdAt: tenant.createdAt.toISOString(),
    deletedAt: tenant.deletedAt?.toISOString() ?? null,
    archivedUntil: tenant.archivedUntil?.toISOString() ?? null,
    defaultWeeklyTargetMinutes: tenant.defaultWeeklyTargetMinutes,
    defaultHazMinutesPerWeek: tenant.defaultHazMinutesPerWeek,
    initialAdminEmail: initialAdmin?.email ?? null,
    stats: {
      employeeCount,
      weekCount,
      storageBytesEstimated: estimateStorageBytes({
        employees: employeeCount,
        weeks: weekCount,
        bookings: bookingCount,
      }),
    },
  };
}

export async function createTenantAction(
  _prev: ActionResult<{ tenantId: string; temporaryPassword: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ tenantId: string; temporaryPassword: string }>> {
  const systemAdmin = await requireSystemAdmin();
  const parsed = createTenantSchema.safeParse({
    name: readOptionalString(formData.get("name")) ?? "",
    slug: readOptionalString(formData.get("slug")) ?? "",
    defaultWeeklyTargetMinutes: formData.get("defaultWeeklyTargetMinutes"),
    defaultHazMinutesPerWeek: formData.get("defaultHazMinutesPerWeek"),
    adminEmail: readOptionalString(formData.get("adminEmail")) ?? "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  if (parsed.data.defaultHazMinutesPerWeek < parsed.data.defaultWeeklyTargetMinutes) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: {
        defaultHazMinutesPerWeek: "Default-HAZ darf nicht kleiner als Default-Sollzeit sein.",
      },
    };
  }

  const email = parsed.data.adminEmail.toLowerCase();
  const existingSlug = await prisma.tenant.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });
  if (existingSlug) {
    return {
      ok: false,
      error: "Slug ist bereits vergeben.",
      fieldErrors: { slug: "Slug ist bereits vergeben." },
    };
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        defaultWeeklyTargetMinutes: parsed.data.defaultWeeklyTargetMinutes,
        defaultHazMinutesPerWeek: parsed.data.defaultHazMinutesPerWeek,
      },
      select: { id: true, name: true, slug: true },
    });
    const adminUser = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
      select: { id: true },
    });

    await writeAuditCore(tx, {
      tenantId: tenant.id,
      userId: systemAdmin.id,
      action: "TENANT_CREATED",
      entity: "Tenant",
      entityId: tenant.id,
      newValue: {
        name: tenant.name,
        slug: tenant.slug,
        defaultWeeklyTargetMinutes: parsed.data.defaultWeeklyTargetMinutes,
        defaultHazMinutesPerWeek: parsed.data.defaultHazMinutesPerWeek,
        initialAdminEmail: email,
      },
      comment: `Initial admin user id: ${adminUser.id}`,
    });

    return tenant.id;
  });

  safeRevalidatePath("createTenantAction", "/system-admin/tenants");
  return { ok: true, data: { tenantId: result, temporaryPassword } };
}

export async function deactivateTenantAction(tenantId: string): Promise<ActionResult> {
  const systemAdmin = await requireSystemAdmin();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, deletedAt: true },
  });
  if (!tenant) return { ok: false, error: "Mandant nicht gefunden." };
  if (tenant.deletedAt) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        ...softDeleteFields(systemAdmin.id),
      },
    });
    await writeAuditCore(tx, {
      tenantId,
      userId: systemAdmin.id,
      action: "TENANT_DEACTIVATED",
      entity: "Tenant",
      entityId: tenantId,
      oldValue: { deletedAt: null },
      newValue: { deletedAt: "set" },
    });
  });

  safeRevalidatePath("deactivateTenantAction", "/system-admin/tenants");
  safeRevalidatePath("deactivateTenantAction", `/system-admin/tenants/${tenantId}`);
  return { ok: true };
}

export async function reactivateTenantAction(tenantId: string): Promise<ActionResult> {
  const systemAdmin = await requireSystemAdmin();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, deletedAt: true, deletedById: true },
  });
  if (!tenant) return { ok: false, error: "Mandant nicht gefunden." };
  if (!tenant.deletedAt) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        deletedAt: null,
        deletedById: null,
      },
    });
    await writeAuditCore(tx, {
      tenantId,
      userId: systemAdmin.id,
      action: "TENANT_REACTIVATED",
      entity: "Tenant",
      entityId: tenantId,
      oldValue: { deletedAt: tenant.deletedAt?.toISOString(), deletedById: tenant.deletedById },
      newValue: { deletedAt: null, deletedById: null },
    });
  });

  safeRevalidatePath("reactivateTenantAction", "/system-admin/tenants");
  safeRevalidatePath("reactivateTenantAction", `/system-admin/tenants/${tenantId}`);
  return { ok: true };
}

export async function updateTenantAction(formData: FormData): Promise<ActionResult> {
  const systemAdmin = await requireSystemAdmin();
  const parsed = updateTenantSchema.safeParse({
    tenantId: readOptionalString(formData.get("tenantId")) ?? "",
    name: readOptionalString(formData.get("name")) ?? "",
    slug: readOptionalString(formData.get("slug")) ?? "",
    defaultWeeklyTargetMinutes: formData.get("defaultWeeklyTargetMinutes"),
    defaultHazMinutesPerWeek: formData.get("defaultHazMinutesPerWeek"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  if (parsed.data.defaultHazMinutesPerWeek < parsed.data.defaultWeeklyTargetMinutes) {
    return {
      ok: false,
      error: "Default-HAZ darf nicht kleiner als Default-Sollzeit sein.",
      fieldErrors: {
        defaultHazMinutesPerWeek: "Default-HAZ darf nicht kleiner als Default-Sollzeit sein.",
      },
    };
  }

  const current = await prisma.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      defaultWeeklyTargetMinutes: true,
      defaultHazMinutesPerWeek: true,
    },
  });
  if (!current) return { ok: false, error: "Mandant nicht gefunden." };

  const slugConflict = await prisma.tenant.findFirst({
    where: {
      slug: parsed.data.slug,
      NOT: { id: parsed.data.tenantId },
    },
    select: { id: true },
  });
  if (slugConflict) {
    return {
      ok: false,
      error: "Slug ist bereits vergeben.",
      fieldErrors: { slug: "Slug ist bereits vergeben." },
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: parsed.data.tenantId },
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        defaultWeeklyTargetMinutes: parsed.data.defaultWeeklyTargetMinutes,
        defaultHazMinutesPerWeek: parsed.data.defaultHazMinutesPerWeek,
      },
    });
    await writeAuditCore(tx, {
      tenantId: parsed.data.tenantId,
      userId: systemAdmin.id,
      action: "TENANT_UPDATED",
      entity: "Tenant",
      entityId: parsed.data.tenantId,
      oldValue: current,
      newValue: {
        name: parsed.data.name,
        slug: parsed.data.slug,
        defaultWeeklyTargetMinutes: parsed.data.defaultWeeklyTargetMinutes,
        defaultHazMinutesPerWeek: parsed.data.defaultHazMinutesPerWeek,
      },
    });
  });

  safeRevalidatePath("updateTenantAction", "/system-admin/tenants");
  safeRevalidatePath("updateTenantAction", `/system-admin/tenants/${parsed.data.tenantId}`);
  return { ok: true };
}
