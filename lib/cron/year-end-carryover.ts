import type { PrismaClient } from "@/lib/generated/prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { writeAuditCore } from "@/lib/audit/core";
import { applyYearEndCarryover } from "@/lib/bookings/core";

const TZ_ZURICH = "Europe/Zurich";

/** Kalendertag 1.1. im Mandanten-Ziel-TZ — für Jahresstart-Kontext. */
export function isJanuaryFirstInTz(now: Date, timeZone = TZ_ZURICH): boolean {
  const ymd = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const [, m, d] = ymd.split("-");
  return m === "01" && d === "01";
}

/**
 * `fromYear` für den Vortrag: am 1.1.YYYY Vortrag aus (YYYY-1) → YYYY.
 * Bei Tests mit `force` dasselbe Schema: aktuelles Jahr in TZ minus 1.
 */
export function resolveCarryoverFromYear(now: Date, timeZone = TZ_ZURICH): number {
  const ymd = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const y = Number(ymd.split("-")[0]);
  return y - 1;
}

export interface AutoYearEndCarryoverResult {
  skipped: boolean;
  reason?: "not_january_first";
  tenantsProcessed: number;
  carryoversRun: number;
  fromYear: number | null;
  timeZone: string;
  errors: string[];
}

/**
 * Pro Tenant: Jahreswechsel-Carryover (idempotent) + Audit YEAR_END_CARRYOVER_AUTO.
 * Läuft nur am 1.1. (TZ) oder mit force.
 */
export async function runAutoYearEndCarryoverForAllTenants(
  prisma: PrismaClient,
  now: Date,
  options: { force?: boolean; timeZone?: string } = {},
): Promise<AutoYearEndCarryoverResult> {
  const timeZone = options.timeZone ?? TZ_ZURICH;
  const force = options.force === true;

  if (!force && !isJanuaryFirstInTz(now, timeZone)) {
    return {
      skipped: true,
      reason: "not_january_first",
      tenantsProcessed: 0,
      carryoversRun: 0,
      fromYear: null,
      timeZone,
      errors: [],
    };
  }

  const fromYear = resolveCarryoverFromYear(now, timeZone);
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  const errors: string[] = [];
  let carryoversRun = 0;

  for (const tenant of tenants) {
    const adminUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id, role: "ADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!adminUser) {
      errors.push(`tenant ${tenant.id}: kein aktiver Admin-User für Carryover/Audit`);
      continue;
    }

    try {
      const result = await applyYearEndCarryover(
        prisma,
        fromYear,
        adminUser.id,
        tenant.id,
      );
      await writeAuditCore(prisma, {
        tenantId: tenant.id,
        userId: adminUser.id,
        action: "YEAR_END_CARRYOVER_AUTO",
        entity: "AccountBalance",
        newValue: {
          fromYear: result.fromYear,
          toYear: result.toYear,
          employees: result.employeesProcessed,
          bookingsCreated: result.bookingsCreated,
        },
      });
      carryoversRun += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`tenant ${tenant.id}: ${msg}`);
    }
  }

  return {
    skipped: false,
    tenantsProcessed: tenants.length,
    carryoversRun,
    fromYear,
    timeZone,
    errors,
  };
}
