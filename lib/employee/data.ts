import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import type {
  MyAccountsView,
  MyRequestView,
  RequestStatus,
  RequestType,
} from "@/components/employee/types";
import { buildMyAccountsView } from "@/lib/employee/accounts-transform";
import type { SessionUser } from "@/server/_shared";

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
  user: Pick<SessionUser, "tenantId">,
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
    where: { ...where, tenantId: user.tenantId },
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
    decisionComment: r.decisionComment,
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function loadMyAccounts(
  user: Pick<SessionUser, "tenantId">,
  employeeId: string,
  year: number,
): Promise<MyAccountsView> {
  const [balances, employee] = await Promise.all([
    prisma.accountBalance.findMany({
      where: { tenantId: user.tenantId, employeeId, year },
    }),
    prisma.employee.findFirst({
      where: { id: employeeId, tenantId: user.tenantId, deletedAt: null },
      select: { vacationDaysPerYear: true },
    }),
  ]);

  return buildMyAccountsView(balances, employee);
}
