import type { Role } from "@/lib/generated/prisma/enums";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  employeeId?: string | null;
}

export function isAdmin(user: SessionUser | null | undefined): boolean {
  return user?.role === "ADMIN";
}

export function isEmployee(user: SessionUser | null | undefined): boolean {
  return user?.role === "EMPLOYEE";
}

export function assertAdmin(user: SessionUser | null | undefined): asserts user is SessionUser {
  if (!isAdmin(user)) {
    throw new Error("Forbidden: admin role required");
  }
}

export function assertAuthenticated(
  user: SessionUser | null | undefined
): asserts user is SessionUser {
  if (!user) {
    throw new Error("Unauthorized: not signed in");
  }
}
