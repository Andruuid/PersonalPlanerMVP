import type { Role } from "@/lib/generated/prisma/enums";

/** Shape needed for active-login checks (matches Prisma include on User.employee). */
export type CredentialsLoginUserForActiveCheck = {
  isActive: boolean;
  role: Role;
  employee: {
    id: string;
    status: "AKTIV" | "INAKTIV" | "AUSGETRETEN" | "ARCHIVIERT";
  } | null;
};

/**
 * Credentials-provider login: deny when user is inactive, or EMPLOYEE without an
 * active, non-deleted employee row. ADMIN without Employee stays allowed.
 */
export function isCredentialsLoginAllowed(
  user: CredentialsLoginUserForActiveCheck,
): boolean {
  if (!user.isActive) return false;
  if (user.role !== "EMPLOYEE") return true;
  const e = user.employee;
  return !!(e && e.status === "AKTIV");
}
