import { auth } from "@/lib/auth";
import type { Role } from "@/lib/generated/prisma/enums";
import type { ZodError } from "zod";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  employeeId?: string | null;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function requireAdmin(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: not signed in");
  }
  if (session.user.role !== "ADMIN") {
    throw new Error("Forbidden: admin role required");
  }
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    role: session.user.role,
    employeeId: session.user.employeeId ?? null,
  };
}

export async function requireEmployee(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: not signed in");
  }
  if (!session.user.employeeId) {
    throw new Error("Forbidden: linked employee profile required");
  }
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    role: session.user.role,
    employeeId: session.user.employeeId,
  };
}

export function fieldErrorsFromZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export function readOptionalString(
  value: FormDataEntryValue | null,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Maps Prisma / driver errors (e.g. interactive transaction timeout) to a
 * user-visible German message without leaking stack details.
 */
export function actionErrorFromDatabase(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /expired transaction|Transaction API error|interactive transaction.*timeout|timed out.*transaction/i.test(
      msg,
    )
  ) {
    return "Die Datenbank-Abrechnung hat zu lange gedauert. Bitte erneut versuchen. Bleibt der Fehler, wenden Sie sich an die Verwaltung.";
  }
  return "Beim Verarbeiten ist ein technischer Fehler aufgetreten. Bitte erneut versuchen.";
}

export function readBooleanFlag(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}
