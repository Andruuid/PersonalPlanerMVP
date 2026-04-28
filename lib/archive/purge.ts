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
    weeks: number;
    employees: number;
    locations: number;
  };
  deleted: {
    planEntries: number;
    weeks: number;
    employees: number;
    locations: number;
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

  const [planEntries, weeks, employees, locations] = await Promise.all([
    prisma.planEntry.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        ...(tenantId ? { week: { tenantId } } : {}),
      },
      select: { id: true },
    }),
    prisma.week.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    }),
    prisma.employee.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    }),
    prisma.location.findMany({
      where: {
        deletedAt: { not: null },
        archivedUntil: { lte: asOf },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true },
    }),
  ]);

  const candidates = {
    planEntries: planEntries.length,
    weeks: weeks.length,
    employees: employees.length,
    locations: locations.length,
  };

  if (dryRun) {
    return {
      dryRun: true,
      asOf,
      candidates,
      deleted: { planEntries: 0, weeks: 0, employees: 0, locations: 0 },
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
