import "server-only";
import { prisma } from "@/lib/db";

export interface WeekIdentity {
  id: string;
  year: number;
  weekNumber: number;
  status: "DRAFT" | "REOPENED" | "PUBLISHED" | "CLOSED";
  publishedAt: Date | null;
  closedAt: Date | null;
}

/**
 * Returns the Week row for (tenant, year, weekNumber), creating it as DRAFT if
 * missing. This is an internal server helper; callers must pass a trusted
 * tenant id from the authenticated session.
 */
export async function getOrCreateWeekForTenant(
  tenantId: string,
  year: number,
  weekNumber: number,
): Promise<WeekIdentity> {
  const existing = await prisma.week.findUnique({
    where: { tenantId_year_weekNumber: { tenantId, year, weekNumber } },
  });
  if (existing && !existing.deletedAt) return existing as WeekIdentity;
  if (existing && existing.deletedAt) {
    // Tenant scope verified via the preceding week.findUnique by composite (tenantId, year, weekNumber).
    // eslint-disable-next-line tenant/require-tenant-scope
    const revived = await prisma.week.update({
      where: { id: existing.id },
      data: { deletedAt: null, archivedUntil: null, deletedById: null },
    });
    return revived as WeekIdentity;
  }

  const created = await prisma.week.create({
    data: { tenantId, year, weekNumber, status: "DRAFT" },
  });
  return created as WeekIdentity;
}
