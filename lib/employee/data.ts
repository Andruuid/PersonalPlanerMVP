import "server-only";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
import type {
  MyAccountsView,
  MyRequestView,
  MyShiftWishView,
  RequestStatus,
  RequestType,
  ServiceTemplateWishOption,
} from "@/components/employee/types";
import { buildMyAccountsView } from "@/lib/employee/accounts-transform";
import type { SessionUser } from "@/server/_shared";
import {
  baseDailySollMinutes,
  effectiveStandardWorkDays,
} from "@/lib/time/soll";

function fmtRange(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return format(start, "dd.MM.yyyy");
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear) {
    return `${format(start, "dd.MM.")} – ${format(end, "dd.MM.yyyy")}`;
  }
  return `${format(start, "dd.MM.yyyy")} – ${format(end, "dd.MM.yyyy")}`;
}

export async function loadServiceTemplatesForShiftWish(
  tenantId: string,
): Promise<ServiceTemplateWishOption[]> {
  const rows = await prisma.serviceTemplate.findMany({
    where: { tenantId, deletedAt: null, isActive: true },
    orderBy: [{ name: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      startTime: true,
      endTime: true,
      breakMinutes: true,
    },
  });
  return rows;
}

export async function loadMyShiftWishes(
  user: Pick<SessionUser, "tenantId">,
  employeeId: string,
  options: { limit?: number; statusFilter?: RequestStatus[] } = {},
): Promise<MyShiftWishView[]> {
  const statusIn: RequestStatus[] = options.statusFilter ?? [
    "OPEN",
    "APPROVED",
    "REJECTED",
    "WITHDRAWN",
    "CANCELLED",
  ];
  const rows = await prisma.shiftWish.findMany({
    where: {
      employeeId,
      tenantId: user.tenantId,
      deletedAt: null,
      status: { in: statusIn },
    },
    orderBy: { createdAt: "desc" },
    take: options.limit,
    include: {
      preferredServiceTemplate: {
        select: { code: true, name: true },
      },
    },
  });

  return rows.map((r) => {
    const tpl = r.preferredServiceTemplate;
    const summaryLabel = tpl
      ? `${tpl.name} (${tpl.code})`
      : r.preferredOneTimeLabel
        ? `${r.preferredOneTimeLabel} (${r.oneTimeStart}–${r.oneTimeEnd})`
        : "Schicht-Wunsch";
    return {
      id: r.id,
      status: r.status as RequestStatus,
      dateIso: format(r.date, "yyyy-MM-dd"),
      dateLabel: format(r.date, "dd.MM.yyyy"),
      summaryLabel,
      comment: r.comment,
      decisionComment: r.decisionComment,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
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
    where: { ...where, tenantId: user.tenantId, deletedAt: null },
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
      select: {
        vacationDaysPerYear: true,
        weeklyTargetMinutes: true,
        standardWorkDays: true,
        tenant: { select: { defaultStandardWorkDays: true } },
      },
    }),
  ]);

  const employeeForAccounts = employee
    ? {
        vacationDaysPerYear: employee.vacationDaysPerYear,
        baseDailySollMinutes: baseDailySollMinutes(
          employee.weeklyTargetMinutes,
          effectiveStandardWorkDays(
            employee.standardWorkDays,
            employee.tenant.defaultStandardWorkDays,
          ),
        ),
      }
    : null;

  return buildMyAccountsView(balances, employeeForAccounts);
}
