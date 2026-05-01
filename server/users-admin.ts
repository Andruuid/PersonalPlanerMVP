"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { requireAdmin, safeRevalidatePath, type ActionResult } from "./_shared";
import type { Role } from "@/lib/generated/prisma/enums";

const TENANT_MANAGEABLE_ROLES: ReadonlySet<Role> = new Set(["ADMIN", "EMPLOYEE"]);

export interface AdminUserRow {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  linkedEmployeeName: string | null;
  lastLoginAtIso: string | null;
}

export async function loadAdminUsers(): Promise<AdminUserRow[]> {
  const admin = await requireAdmin();
  const [users, loginEvents] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: admin.tenantId },
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        employee: {
          select: { firstName: true, lastName: true },
        },
      },
    }),
    prisma.auditLog.findMany({
      where: { tenantId: admin.tenantId, action: "LOGIN", entity: "User" },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        createdAt: true,
      },
    }),
  ]);

  const lastLoginByUser = new Map<string, string>();
  for (const event of loginEvents) {
    if (!lastLoginByUser.has(event.userId)) {
      lastLoginByUser.set(event.userId, event.createdAt.toISOString());
    }
  }

  const rows = users.map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    linkedEmployeeName: user.employee
      ? `${user.employee.firstName} ${user.employee.lastName}`
      : null,
    lastLoginAtIso: lastLoginByUser.get(user.id) ?? null,
  }));

  return rows.sort((a, b) => {
    const adminRankA = a.role === "ADMIN" ? 0 : 1;
    const adminRankB = b.role === "ADMIN" ? 0 : 1;
    if (adminRankA !== adminRankB) {
      return adminRankA - adminRankB;
    }
    return a.email.localeCompare(b.email, "de-CH", { sensitivity: "base" });
  });
}

export async function setAdminUserLockAction(
  userId: string,
  locked: boolean,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userId === admin.id) {
    return { ok: false, error: "Du kannst dich hier nicht selbst bearbeiten." };
  }

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true, isActive: true },
  });
  if (!before || before.tenantId !== admin.tenantId) {
    return { ok: false, error: "Benutzer:in nicht gefunden." };
  }

  const nextIsActive = !locked;
  await prisma.user.update({
    where: { id: userId },
    data: { isActive: nextIsActive },
  });

  await writeAudit({
    userId: admin.id,
    action: locked ? "LOCK_USER" : "UNLOCK_USER",
    entity: "User",
    entityId: userId,
    oldValue: { userIsActive: before.isActive },
    newValue: { userIsActive: nextIsActive },
  });

  safeRevalidatePath("setAdminUserLockAction", "/users");
  safeRevalidatePath("setAdminUserLockAction", "/", "layout");
  return { ok: true };
}

export async function changeAdminUserRoleAction(
  userId: string,
  role: Role,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!TENANT_MANAGEABLE_ROLES.has(role)) {
    return { ok: false, error: "Diese Rolle darf hier nicht vergeben werden." };
  }
  if (userId === admin.id) {
    return { ok: false, error: "Du kannst dich hier nicht selbst bearbeiten." };
  }

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true, role: true },
  });
  if (!before || before.tenantId !== admin.tenantId) {
    return { ok: false, error: "Benutzer:in nicht gefunden." };
  }
  if (!TENANT_MANAGEABLE_ROLES.has(before.role)) {
    return { ok: false, error: "Diese Rolle darf hier nicht bearbeitet werden." };
  }
  if (before.role === role) {
    return { ok: true };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });

  await writeAudit({
    userId: admin.id,
    action: "ROLE_CHANGE",
    entity: "User",
    entityId: userId,
    oldValue: { role: before.role },
    newValue: { role },
  });

  safeRevalidatePath("changeAdminUserRoleAction", "/users");
  safeRevalidatePath("changeAdminUserRoleAction", "/", "layout");
  return { ok: true };
}

function generateTemporaryPassword(): string {
  const token = randomBytes(12).toString("base64url");
  return `Tmp-${token}`;
}

export async function resetAdminUserPasswordAction(
  userId: string,
): Promise<ActionResult<{ temporaryPassword: string }>> {
  const admin = await requireAdmin();
  if (userId === admin.id) {
    return { ok: false, error: "Du kannst dich hier nicht selbst bearbeiten." };
  }

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tenantId: true },
  });
  if (!before || before.tenantId !== admin.tenantId) {
    return { ok: false, error: "Benutzer:in nicht gefunden." };
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  await writeAudit({
    userId: admin.id,
    action: "PASSWORD_RESET",
    entity: "User",
    entityId: userId,
    newValue: { passwordReset: true },
  });

  safeRevalidatePath("resetAdminUserPasswordAction", "/users");
  return { ok: true, data: { temporaryPassword } };
}
