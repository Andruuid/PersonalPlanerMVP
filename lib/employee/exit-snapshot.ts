import type { PrismaClient, Prisma } from "@/lib/generated/prisma/client";

export const EXIT_SNAPSHOT_VERSION = 1 as const;

export type ExitSnapshotAccountRow = {
  accountType: string;
  year: number;
  openingValue: number;
  currentValue: number;
  unit: string;
};

export type ExitSnapshotErtCaseRow = {
  id: string;
  triggerDate: string;
  holidayWorkMinutes: number;
  status: string;
  dueAt: string;
};

export type ExitSnapshotCompensationCaseRow = {
  id: string;
  triggerDate: string;
  holidayWorkMinutes: number;
  status: string;
  dueAt: string;
};

export type ExitSnapshotData = {
  version: typeof EXIT_SNAPSHOT_VERSION;
  exitDate: string;
  accounts: ExitSnapshotAccountRow[];
  openErtCases: ExitSnapshotErtCaseRow[];
  openCompensationCases: ExitSnapshotCompensationCaseRow[];
};

export function parseExitSnapshotJson(raw: string): ExitSnapshotData | null {
  try {
    const v = JSON.parse(raw) as ExitSnapshotData;
    if (v?.version !== EXIT_SNAPSHOT_VERSION || !Array.isArray(v.accounts)) {
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export type ExitSnapshotDb = Prisma.TransactionClient | PrismaClient;

/** Kalendertag-Vergleich (UTC-Datumsteil), konsistent zur Speicherung von exitDate. */
export function exitDatesEqualCalendar(
  a: Date | null | undefined,
  b: Date | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** Austritt liegt vor dem heutigen Kalendertag (UTC). */
export function isExitDateInPast(exitDate: Date): boolean {
  const exitDay = exitDate.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return exitDay < today;
}

export function exitDateChangeTriggersSnapshot(
  beforeExit: Date | null | undefined,
  nextExit: Date | null | undefined,
): boolean {
  if (!nextExit) return false;
  return !exitDatesEqualCalendar(beforeExit ?? null, nextExit);
}

/**
 * Baut den Kontenabschluss-Snapshot: aktuelle AccountBalance-Stände plus offene
 * ERT-/Kompensationspflichten (OPEN bzw. bei ERT auch OVERDUE).
 */
export async function buildExitSnapshot(
  prisma: ExitSnapshotDb,
  employeeId: string,
): Promise<{ snapshotJson: string; data: ExitSnapshotData }> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { exitDate: true },
  });
  const exitDate = emp?.exitDate;
  if (!exitDate) {
    throw new Error(`buildExitSnapshot: kein Austrittsdatum für ${employeeId}`);
  }

  const [accounts, openErtCases, openCompensationCases] = await Promise.all([
    prisma.accountBalance.findMany({
      where: { employeeId },
      orderBy: [{ accountType: "asc" }, { year: "asc" }],
    }),
    prisma.ertCase.findMany({
      where: {
        employeeId,
        status: { in: ["OPEN", "OVERDUE"] },
      },
      orderBy: [{ dueAt: "asc" }],
    }),
    prisma.compensationCase.findMany({
      where: {
        employeeId,
        status: "OPEN",
      },
      orderBy: [{ dueAt: "asc" }],
    }),
  ]);

  const data: ExitSnapshotData = {
    version: EXIT_SNAPSHOT_VERSION,
    exitDate: exitDate.toISOString(),
    accounts: accounts.map((a) => ({
      accountType: a.accountType,
      year: a.year,
      openingValue: a.openingValue,
      currentValue: a.currentValue,
      unit: a.unit,
    })),
    openErtCases: openErtCases.map((c) => ({
      id: c.id,
      triggerDate: c.triggerDate.toISOString(),
      holidayWorkMinutes: c.holidayWorkMinutes,
      status: c.status,
      dueAt: c.dueAt.toISOString(),
    })),
    openCompensationCases: openCompensationCases.map((c) => ({
      id: c.id,
      triggerDate: c.triggerDate.toISOString(),
      holidayWorkMinutes: c.holidayWorkMinutes,
      status: c.status,
      dueAt: c.dueAt.toISOString(),
    })),
  };

  return { snapshotJson: JSON.stringify(data), data };
}
