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
import {
  ShiftWishesTable,
  type ShiftWishRow,
  type ShiftWishRowStatus,
} from "@/components/admin/absences/shift-wishes-table";
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

  const where = {
    tenantId: admin.tenantId,
    deletedAt: null,
    ...(status !== "ALL" ? { status } : {}),
    ...(type !== "ALL" ? { type } : {}),
    ...(employeeId !== "ALL" ? { employeeId } : {}),
  };

  const wishWhere = {
    tenantId: admin.tenantId,
    deletedAt: null,
    ...(status !== "ALL" ? { status } : {}),
    ...(employeeId !== "ALL" ? { employeeId } : {}),
  };

  const [requests, statusCounts, shiftWishes] = await Promise.all([
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
    prisma.shiftWish.findMany({
      where: wishWhere,
      orderBy: [{ status: "asc" }, { date: "asc" }, { createdAt: "desc" }],
      include: {
        employee: {
          select: { firstName: true, lastName: true, roleLabel: true },
        },
        preferredServiceTemplate: {
          select: { code: true, name: true },
        },
      },
    }),
  ]);

  const decidedByIds = Array.from(
    new Set(
      [...requests.map((r) => r.decidedById), ...shiftWishes.map((w) => w.decidedById)]
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

  const shiftRows: ShiftWishRow[] = shiftWishes.map((w) => {
    const tpl = w.preferredServiceTemplate;
    const wishSummary = tpl
      ? `${tpl.name} (${tpl.code})`
      : w.preferredOneTimeLabel &&
          w.oneTimeStart &&
          w.oneTimeEnd
        ? `${w.preferredOneTimeLabel} (${w.oneTimeStart}–${w.oneTimeEnd})`
        : "Schicht-Wunsch";

    return {
      id: w.id,
      employeeId: w.employeeId,
      employeeName: `${w.employee.firstName} ${w.employee.lastName}`,
      employeeRoleLabel: w.employee.roleLabel,
      status: w.status as ShiftWishRowStatus,
      dateLabel: format(w.date, "dd.MM.yyyy"),
      wishSummary,
      comment: w.comment,
      decisionComment: w.decisionComment,
      createdAtLabel: format(w.createdAt, "dd.MM.yyyy HH:mm"),
      decidedAtLabel: w.decidedAt
        ? format(w.decidedAt, "dd.MM.yyyy HH:mm")
        : null,
      decidedByEmail: w.decidedById
        ? decidedByEmail.get(w.decidedById) ?? null
        : null,
    };
  });

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
        description="Eingang von Abwesenheitsanträgen und Schicht-Wünschen. Genehmigte Einträge erscheinen automatisch in der Wochenplanung."
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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          Schicht-Wünsche
        </h2>
        <p className="text-xs text-neutral-500">
          Gleiche Filter für Status und Mitarbeitende wie oben. Der Antragstyp-Filter gilt nur für Abwesenheiten.
        </p>
        <ShiftWishesTable rows={shiftRows} />
      </section>

      <AbsencesLiveRefresh />
    </div>
  );
}
