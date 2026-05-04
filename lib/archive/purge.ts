/* eslint-disable tenant/require-tenant-scope --
 * Maintenance helper. Either operates per-tenant (tenantId already in scope
 * via the option) or explicitly opts in to all-tenants via `allTenants: true`.
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";

export interface PurgeArchivedOptions {
  /** Defaults to current timestamp. */
  now?: Date;
  /** When true, only computes candidates without deleting anything. */
  dryRun?: boolean;
  /** Restrict purge to one tenant. Prefer this for production operations. */
  tenantId?: string;
  /** Explicit opt-in for database-wide purge. */
  allTenants?: boolean;
}

export interface PurgeArchivedResult {
  dryRun: boolean;
  asOf: Date;
  candidates: {
    planEntries: number;
    absenceRequests: number;
    bookings: number;
    accountBalances: number;
    weeks: number;
    employees: number;
    locations: number;
    serviceTemplates: number;
  };
  deleted: {
    planEntries: number;
    absenceRequests: number;
    bookings: number;
    accountBalances: number;
    weeks: number;
    employees: number;
    locations: number;
    serviceTemplates: number;
  };
}

export async function purgeArchivedData(
  prisma: PrismaClient,
  options: PurgeArchivedOptions = {},
): Promise<PurgeArchivedResult> {
  const asOf = options.now ?? new Date();
  const dryRun = options.dryRun ?? false;
  if (!options.tenantId && !options.allTenants) {
    throw new Error("purgeArchivedData requires tenantId or allTenants: true");
  }
  const tenantId = options.tenantId;

  // Audit logs are intentionally excluded from purge; retention is append-only
  // unless a separate, explicit policy is introduced.
  const [
    planEntries,
    absenceRequests,
    bookings,
    accountBalances,
    weeks,
    employees,
    locations,
    serviceTemplates,
  ] =
    await Promise.all([
    prisma.planEntry.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        ...(tenantId ? { week: { tenantId } } : {}),
      },
      select: { id: true },
    }),
    prisma.absenceRequest.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    }),
    prisma.booking.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    }),
    prisma.accountBalance.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    }),
    prisma.week.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        planEntries: {
          every: {
            deletedAt: { not: null },
            archivedUntil: { lte: asOf },
          },
        },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    }),
    prisma.employee.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        planEntries: {
          every: {
            deletedAt: { not: null },
            archivedUntil: { lte: asOf },
          },
        },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    }),
    prisma.location.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        employees: {
          every: {
            deletedAt: { not: null },
            archivedUntil: { lte: asOf },
          },
        },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    }),
    prisma.serviceTemplate.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        planEntries: {
          every: {
            deletedAt: { not: null },
            archivedUntil: { lte: asOf },
          },
        },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    }),
  ]);

  const candidates = {
    planEntries: planEntries.length,
    absenceRequests: absenceRequests.length,
    bookings: bookings.length,
    accountBalances: accountBalances.length,
    weeks: weeks.length,
    employees: employees.length,
    locations: locations.length,
    serviceTemplates: serviceTemplates.length,
  };

  if (dryRun) {
    return {
      dryRun: true,
      asOf,
      candidates,
      deleted: {
        planEntries: 0,
        absenceRequests: 0,
        bookings: 0,
        accountBalances: 0,
        weeks: 0,
        employees: 0,
        locations: 0,
        serviceTemplates: 0,
      },
    };
  }

  const deleted = await prisma.$transaction(async (tx) => {
    const planEntriesDeleted =
      planEntries.length > 0
        ? (
            await tx.planEntry.deleteMany({
              where: { id: { in: planEntries.map((e) => e.id) } },
            })
          ).count
        : 0;

    const serviceTemplatesDeleted =
      serviceTemplates.length > 0
        ? (
            await tx.serviceTemplate.deleteMany({
              where: { id: { in: serviceTemplates.map((s) => s.id) } },
            })
          ).count
        : 0;

    const absenceRequestsDeleted =
      absenceRequests.length > 0
        ? (
            await tx.absenceRequest.deleteMany({
              where: { id: { in: absenceRequests.map((r) => r.id) } },
            })
          ).count
        : 0;

    const bookingsDeleted =
      bookings.length > 0
        ? (
            await tx.booking.deleteMany({
              where: { id: { in: bookings.map((b) => b.id) } },
            })
          ).count
        : 0;

    const accountBalancesDeleted =
      accountBalances.length > 0
        ? (
            await tx.accountBalance.deleteMany({
              where: { id: { in: accountBalances.map((b) => b.id) } },
            })
          ).count
        : 0;

    const weeksDeleted =
      weeks.length > 0
        ? (
            await tx.week.deleteMany({
              where: { id: { in: weeks.map((w) => w.id) } },
            })
          ).count
        : 0;

    const employeesDeleted =
      employees.length > 0
        ? (
            await tx.employee.deleteMany({
              where: { id: { in: employees.map((e) => e.id) } },
            })
          ).count
        : 0;

    const locationsDeleted =
      locations.length > 0
        ? (
            await tx.location.deleteMany({
              where: { id: { in: locations.map((l) => l.id) } },
            })
          ).count
        : 0;

    return {
      planEntries: planEntriesDeleted,
      serviceTemplates: serviceTemplatesDeleted,
      absenceRequests: absenceRequestsDeleted,
      bookings: bookingsDeleted,
      accountBalances: accountBalancesDeleted,
      weeks: weeksDeleted,
      employees: employeesDeleted,
      locations: locationsDeleted,
    };
  });

  return {
    dryRun: false,
    asOf,
    candidates,
    deleted,
  };
}
