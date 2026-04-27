import type { SessionUser } from "@/server/_shared";

export function tenantWhere(user: Pick<SessionUser, "tenantId">): {
  tenantId: string;
} {
  return { tenantId: user.tenantId };
}

export function assertSameTenant(
  record: { tenantId: string } | null | undefined,
  user: Pick<SessionUser, "tenantId">,
): void {
  if (!record || record.tenantId !== user.tenantId) {
    throw new Error("Forbidden: tenant mismatch");
  }
}
