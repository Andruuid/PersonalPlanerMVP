import { CalendarDays, FileClock, ShieldCheck, Users } from "lucide-react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { listAuditLogs } from "@/lib/audit";
import { currentIsoWeek } from "@/lib/time/week";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "@/components/admin/dashboard/kpi-card";
import { RecentActivity } from "@/components/admin/dashboard/recent-activity";
import type { WeekStatus } from "@/lib/generated/prisma/enums";
import { requireAdmin } from "@/server/_shared";

export const metadata = { title: "Dashboard · PersonalPlaner" };

const WEEK_STATUS_LABEL: Record<WeekStatus, string> = {
  DRAFT: "Entwurf",
  PUBLISHED: "Veröffentlicht",
  CLOSED: "Abgeschlossen",
};

/** Calendar day in the server timezone (matches “Audit heute” bucket). */
function calendarDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfCalendarDay(dayKey: string): Date {
  const [ys, ms, ds] = dayKey.split("-");
  const y = Number(ys);
  const mo = Number(ms) - 1;
  const day = Number(ds);
  return new Date(y, mo, day);
}

const getCachedDashboardData = unstable_cache(
  async (tenantId: string, weekYear: number, weekNumber: number, dayKey: string) => {
    const today = startOfCalendarDay(dayKey);
    const [openRequests, currentWeek, activeEmployees, auditToday, recentList] =
      await Promise.all([
        prisma.absenceRequest.count({ where: { tenantId, status: "OPEN" } }),
        prisma.week.findUnique({
          where: {
            tenantId_year_weekNumber: { tenantId, year: weekYear, weekNumber },
          },
          select: { status: true, deletedAt: true },
        }),
        prisma.employee.count({ where: { tenantId, isActive: true, deletedAt: null } }),
        prisma.auditLog.count({ where: { tenantId, createdAt: { gte: today } } }),
        listAuditLogs(prisma, { tenantId }, { page: 1, pageSize: 5 }),
      ]);
    return {
      openRequests,
      currentWeek: currentWeek?.deletedAt ? null : currentWeek,
      activeEmployees,
      auditToday,
      recentList,
    };
  },
  ["admin-dashboard-kpis"],
  { revalidate: 30 },
);

export default async function DashboardPage() {
  const admin = await requireAdmin();
  const isoWeek = currentIsoWeek();
  const dayKey = calendarDayKey();

  const { openRequests, currentWeek, activeEmployees, auditToday, recentList } =
    await getCachedDashboardData(admin.tenantId, isoWeek.year, isoWeek.weekNumber, dayKey);

  const weekKw = String(isoWeek.weekNumber).padStart(2, "0");
  const weekValue = `KW ${weekKw}`;
  const weekHint = currentWeek
    ? WEEK_STATUS_LABEL[currentWeek.status]
    : "Noch nicht angelegt";

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Übersicht"
        title="Dashboard"
        description="Kennzahlen, offene Anträge und der Status der aktuellen Woche auf einen Blick."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Offene Anträge"
          value={openRequests.toString()}
          href="/absences"
          icon={FileClock}
          hint="Wartet auf Entscheid"
        />
        <KpiCard
          label="Aktuelle Woche"
          value={weekValue}
          href="/planning"
          icon={CalendarDays}
          hint={weekHint}
        />
        <KpiCard
          label="Aktive Mitarbeitende"
          value={activeEmployees.toString()}
          href="/employees"
          icon={Users}
          hint="Mit aktivem Vertrag"
        />
        <KpiCard
          label="Audit heute"
          value={auditToday.toString()}
          href="/audit"
          icon={ShieldCheck}
          hint="Einträge seit Mitternacht"
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          Letzte Aktivität
        </h2>
        <RecentActivity rows={recentList.rows} />
      </section>
    </div>
  );
}
