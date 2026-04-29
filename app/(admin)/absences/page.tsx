import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/server/_shared";
import { PageHeader } from "@/components/admin/page-header";
import {
  AbsencesFilter,
  type StatusFilter,
  type TypeFilter,
} from "@/components/admin/absences/absences-filter";
import {
  AbsencesTable,
  type AbsenceRequestRow,
  type AbsenceRequestStatus,
  type AbsenceRequestType,
} from "@/components/admin/absences/absences-table";
import { AbsencesLiveRefresh } from "@/components/admin/absences/absences-live-refresh";

export const metadata = { title: "Abwesenheiten · PersonalPlaner" };

interface PageProps {
  searchParams: Promise<{
    status?: string;
    type?: string;
    employee?: string;
  }>;
}

const STATUS_VALUES: StatusFilter[] = ["ALL", "OPEN", "APPROVED", "REJECTED"];
const TYPE_VALUES: TypeFilter[] = [
  "ALL",
  "VACATION",
  "FREE_REQUESTED",
  "UEZ_BEZUG",
  "TZT",
  "FREE_DAY",
];

function pickStatus(raw: string | undefined): StatusFilter {
  return STATUS_VALUES.includes(raw as StatusFilter)
    ? (raw as StatusFilter)
    : "OPEN";
}

function pickType(raw: string | undefined): TypeFilter {
  return TYPE_VALUES.includes(raw as TypeFilter)
    ? (raw as TypeFilter)
    : "ALL";
}

function formatRange(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return format(start, "dd.MM.yyyy");
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear) {
    return `${format(start, "dd.MM.")} – ${format(end, "dd.MM.yyyy")}`;
  }
  return `${format(start, "dd.MM.yyyy")} – ${format(end, "dd.MM.yyyy")}`;
}

export default async function AbsencesPage({ searchParams }: PageProps) {
  const admin = await requireAdmin();
  const raw = await searchParams;
  const status = pickStatus(raw.status);
  const employeeId = raw.employee ?? "ALL";

  const employees = await prisma.employee.findMany({
    where: { tenantId: admin.tenantId, isActive: true, deletedAt: null },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, tztModel: true },
  });

  const selectedEmp =
    employeeId !== "ALL"
      ? employees.find((e) => e.id === employeeId)
      : undefined;
  let type = pickType(raw.type);
  if (selectedEmp?.tztModel === "TARGET_REDUCTION" && type === "TZT") {
    type = "ALL";
  }

  const where: {
    tenantId?: string;
    deletedAt: null;
    status?: AbsenceRequestStatus;
    type?: AbsenceRequestType;
    employeeId?: string;
  } = {};
  where.tenantId = admin.tenantId;
  where.deletedAt = null;
  if (status !== "ALL") where.status = status;
  if (type !== "ALL") where.type = type;
  if (employeeId !== "ALL") where.employeeId = employeeId;

  const [requests, statusCounts] = await Promise.all([
    prisma.absenceRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { startDate: "asc" }, { createdAt: "desc" }],
      include: {
        employee: {
          select: { firstName: true, lastName: true, roleLabel: true },
        },
      },
    }),
    prisma.absenceRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: {
        tenantId: admin.tenantId,
        deletedAt: null,
        ...(type !== "ALL" ? { type } : {}),
        ...(employeeId !== "ALL" ? { employeeId } : {}),
      },
    }),
  ]);

  const decidedByIds = Array.from(
    new Set(
      requests
        .map((r) => r.decidedById)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const decidedByUsers = decidedByIds.length
    ? await prisma.user.findMany({
        where: { tenantId: admin.tenantId, id: { in: decidedByIds } },
        select: { id: true, email: true },
      })
    : [];
  const decidedByEmail = new Map(decidedByUsers.map((u) => [u.id, u.email]));

  const rows: AbsenceRequestRow[] = requests.map((r) => ({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: `${r.employee.firstName} ${r.employee.lastName}`,
    employeeRoleLabel: r.employee.roleLabel,
    type: r.type as AbsenceRequestType,
    status: r.status as AbsenceRequestStatus,
    startIso: format(r.startDate, "yyyy-MM-dd"),
    endIso: format(r.endDate, "yyyy-MM-dd"),
    rangeLabel: formatRange(r.startDate, r.endDate),
    comment: r.comment,
    decisionComment: r.decisionComment,
    createdAtLabel: format(r.createdAt, "dd.MM.yyyy HH:mm"),
    decidedAtLabel: r.decidedAt ? format(r.decidedAt, "dd.MM.yyyy HH:mm") : null,
    decidedByEmail: r.decidedById ? decidedByEmail.get(r.decidedById) ?? null : null,
  }));

  const totalAll = statusCounts.reduce((acc, row) => acc + row._count._all, 0);
  const counts: Record<StatusFilter, number> = {
    ALL: totalAll,
    OPEN: statusCounts.find((s) => s.status === "OPEN")?._count._all ?? 0,
    APPROVED:
      statusCounts.find((s) => s.status === "APPROVED")?._count._all ?? 0,
    REJECTED:
      statusCounts.find((s) => s.status === "REJECTED")?._count._all ?? 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Anträge"
        title="Abwesenheiten"
        description="Eingang aller Wünsche und Anträge. Direkt genehmigen oder ablehnen — Genehmigte Anträge erzeugen automatisch einen passenden Eintrag in der Wochenplanung."
      />

      <AbsencesFilter
        status={status}
        type={type}
        employeeId={employeeId}
        employees={employees.map(({ id, firstName, lastName }) => ({
          id,
          firstName,
          lastName,
        }))}
        counts={counts}
        hideTztTypeOption={
          selectedEmp?.tztModel === "TARGET_REDUCTION"
        }
      />

      <AbsencesTable rows={rows} />

      <AbsencesLiveRefresh />
    </div>
  );
}
