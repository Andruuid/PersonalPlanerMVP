import type { PrismaClient } from "@/lib/generated/prisma/client";
import { writeAuditCore } from "@/lib/audit/core";
import { recalcWeekClose } from "@/lib/bookings/core";
import { isIsoWeekSundayBeforeToday } from "@/lib/time/week";

export async function countOpenWeeksWithPastSunday(
  prisma: PrismaClient,
  tenantId: string,
  asOf: Date,
): Promise<number> {
  const rows = await prisma.week.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: { in: ["DRAFT", "PUBLISHED"] },
    },
    select: { year: true, weekNumber: true },
  });
  return rows.filter((w) =>
    isIsoWeekSundayBeforeToday(w.year, w.weekNumber, asOf),
  ).length;
}

export interface AutoClosePastPublishedResult {
  tenantsProcessed: number;
  weeksClosed: number;
  errors: string[];
}

/**
 * Pro Tenant: vergangene PUBLISHED-Wochen ohne closedAt schließen (recalc + CLOSED + AUTO_CLOSE-Audit).
 */
export async function autoClosePastPublishedWeeksForAllTenants(
  prisma: PrismaClient,
  asOf: Date,
): Promise<AutoClosePastPublishedResult> {
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  const errors: string[] = [];
  let weeksClosed = 0;

  for (const tenant of tenants) {
    const adminUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: "ADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!adminUser) {
      errors.push(`tenant ${tenant.id}: kein aktiver Admin-User für Buchungen/Audit`);
      continue;
    }

    const candidates = await prisma.week.findMany({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        status: "PUBLISHED",
        closedAt: null,
      },
      select: { id: true, year: true, weekNumber: true },
    });

    const toClose = candidates.filter((w) =>
      isIsoWeekSundayBeforeToday(w.year, w.weekNumber, asOf),
    );

    for (const week of toClose) {
      try {
        await recalcWeekClose(prisma, week.id, adminUser.id);
        const closedAt = new Date();
        await prisma.week.update({
          where: { id: week.id },
          data: { status: "CLOSED", closedAt },
        });
        await writeAuditCore(prisma, {
          tenantId: tenant.id,
          userId: adminUser.id,
          action: "AUTO_CLOSE",
          entity: "Week",
          entityId: week.id,
          oldValue: { status: "PUBLISHED" },
          newValue: {
            status: "CLOSED",
            closedAt: closedAt.toISOString(),
            year: week.year,
            weekNumber: week.weekNumber,
          },
        });
        weeksClosed += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(
          `tenant ${tenant.id} week ${week.id} (${week.year}-W${week.weekNumber}): ${msg}`,
        );
      }
    }
  }

  return {
    tenantsProcessed: tenants.length,
    weeksClosed,
    errors,
  };
}
