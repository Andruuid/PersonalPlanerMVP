import type { Role } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/db";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  employeeId?: string | null;
}

export function isAdmin(user: SessionUser | null | undefined): boolean {
  return user?.role === "ADMIN";
}

export function isSystemAdmin(user: SessionUser | null | undefined): boolean {
  return user?.role === "SYSTEM_ADMIN";
}

export function isEmployee(user: SessionUser | null | undefined): boolean {
  return user?.role === "EMPLOYEE";
}

export function assertAdmin(user: SessionUser | null | undefined): asserts user is SessionUser {
  if (!isAdmin(user)) {
    throw new Error("Forbidden: admin role required");
  }
}

export function requireSystemAdmin(
  user: SessionUser | null | undefined
): asserts user is SessionUser {
  if (!isSystemAdmin(user)) {
    throw new Error("Forbidden: system admin role required");
  }
}

export function assertAuthenticated(
  user: SessionUser | null | undefined
): asserts user is SessionUser {
  if (!user) {
    throw new Error("Unauthorized: not signed in");
  }
}

export async function hasMultipleTenants(userEmail: string): Promise<boolean> {
  const email = userEmail.trim().toLowerCase();
  if (!email) return false;
  const count = await prisma.user.count({
    where: { email, isActive: true },
  });
  return count > 1;
}
