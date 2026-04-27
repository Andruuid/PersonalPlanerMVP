import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import type {
  MyAccountValue,
  MyAccountsView,
  MyRequestView,
  RequestStatus,
  RequestType,
} from "@/components/employee/types";

function fmtRange(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return format(start, "dd.MM.yyyy");
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear) {
    return `${format(start, "dd.MM.")} – ${format(end, "dd.MM.yyyy")}`;
  }
  return `${format(start, "dd.MM.yyyy")} – ${format(end, "dd.MM.yyyy")}`;
}

export async function loadMyRequests(
  employeeId: string,
  options: { limit?: number; statusFilter?: RequestStatus[] } = {},
): Promise<MyRequestView[]> {
  const where: { employeeId: string; status?: { in: RequestStatus[] } } = {
    employeeId,
  };
  if (options.statusFilter && options.statusFilter.length > 0) {
    where.status = { in: options.statusFilter };
  }

  const rows = await prisma.absenceRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options.limit,
  });

  return rows.map((r) => ({
    id: r.id,
    type: r.type as RequestType,
    status: r.status as RequestStatus,
    startIso: format(r.startDate, "yyyy-MM-dd"),
    endIso: format(r.endDate, "yyyy-MM-dd"),
    rangeLabel: fmtRange(r.startDate, r.endDate),
    comment: r.comment,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function loadMyAccounts(
  employeeId: string,
  year: number,
): Promise<MyAccountsView> {
  const [balances, employee] = await Promise.all([
    prisma.accountBalance.findMany({
      where: { employeeId, year },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { vacationDaysPerYear: true },
    }),
  ]);

  const get = (
    accountType:
      | "ZEITSALDO"
      | "FERIEN"
      | "UEZ"
      | "TZT"
      | "SONNTAG_FEIERTAG_KOMPENSATION",
  ): MyAccountValue | null => {
    const row = balances.find((b) => b.accountType === accountType);
    if (!row) return null;
    return {
      unit: row.unit as MyAccountValue["unit"],
      value: row.currentValue,
    };
  };

  // FERIEN rows are only created on first week-close (or manual booking) for
  // that year. Until then, show the same opening as `ensureBalanceRow` in
  // lib/bookings/core — full annual allowance from Stammdaten.
  const ferienFromDb = get("FERIEN");
  const ferien: MyAccountValue | null =
    ferienFromDb ??
    (employee
      ? { unit: "DAYS", value: employee.vacationDaysPerYear }
      : null);

  return {
    zeitsaldo: get("ZEITSALDO"),
    ferien,
    tzt: get("TZT"),
    parentalCare: get("PARENTAL_CARE"),
  };
}
