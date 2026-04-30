import {
  CalendarDays,
  CalendarRange,
  FileClock,
  Lock,
  ShieldCheck,
  Users,
} from "lucide-react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { listAuditLogs } from "@/lib/audit";
import { currentIsoWeek } from "@/lib/time/week";
import { countOpenWeeksWithPastSunday } from "@/lib/cron/auto-close-past-weeks";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "@/components/admin/dashboard/kpi-card";
import { CompensationCasesKpi } from "@/components/admin/dashboard/compensation-cases-kpi";
import { RecentActivity } from "@/components/admin/dashboard/recent-activity";
import type { WeekStatus } from "@/lib/generated/prisma/enums";
import { logDebug } from "@/lib/logging";
import { logServerError, requireAdmin } from "@/server/_shared";

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
    const [
      openAbsenceRequests,
      openPrivacyRequests,
      currentWeek,
      activeEmployees,
      auditToday,
      recentList,
      compensationCasesOpen,
      compensationCasesOverdue,
      openWeeksWithPastSunday,
    ] =
      await Promise.all([
        prisma.absenceRequest.count({
          where: { tenantId, status: "OPEN", deletedAt: null },
        }),
        prisma.privacyRequest.count({ where: { tenantId, status: "OPEN" } }),
        prisma.week.findUnique({
          where: {
            tenantId_year_weekNumber: { tenantId, year: weekYear, weekNumber },
          },
          select: { status: true, deletedAt: true },
        }),
        prisma.employee.count({ where: { tenantId, isActive: true, deletedAt: null } }),
        prisma.auditLog.count({ where: { tenantId, createdAt: { gte: today } } }),
        listAuditLogs(prisma, { tenantId }, { page: 1, pageSize: 5 }),
        prisma.compensationCase.count({ where: { tenantId, status: "OPEN" } }),
        prisma.compensationCase.count({
          where: { tenantId, status: "OPEN", dueAt: { lt: today } },
        }),
        countOpenWeeksWithPastSunday(prisma, tenantId, today),
      ]);
    return {
      openAbsenceRequests,
      openPrivacyRequests,
      currentWeek: currentWeek?.deletedAt ? null : currentWeek,
      activeEmployees,
      auditToday,
      recentList,
      compensationCasesOpen,
      compensationCasesOverdue,
      openWeeksWithPastSunday,
    };
  },
  ["admin-dashboard-kpis"],
  { revalidate: 30 },
);

export default async function DashboardPage() {
  const admin = await requireAdmin();
  const isoWeek = currentIsoWeek();
  const dayKey = calendarDayKey();
  logDebug("dashboard:load", "Loading admin dashboard", {
    tenantId: admin.tenantId,
    weekYear: isoWeek.year,
    weekNumber: isoWeek.weekNumber,
    dayKey,
  });

  let dashboardData: Awaited<
    ReturnType<typeof getCachedDashboardData>
  >;
  try {
    dashboardData = await getCachedDashboardData(
      admin.tenantId,
      isoWeek.year,
      isoWeek.weekNumber,
      dayKey,
    );
  } catch (err) {
    logServerError("DashboardPage.dataLoad", err);
    throw err;
  }

  const {
    openAbsenceRequests,
    openPrivacyRequests,
    currentWeek,
    activeEmployees,
    auditToday,
    recentList,
    compensationCasesOpen,
    compensationCasesOverdue,
    openWeeksWithPastSunday,
  } = dashboardData;
  const weekKw = String(isoWeek.weekNumber).padStart(2, "0");
  const weekValue = `KW ${weekKw}`;
  const weekHint = currentWeek
    ? WEEK_STATUS_LABEL[currentWeek.status]
    : "Noch nicht angelegt";
  logDebug("dashboard:load", "Dashboard data loaded", {
    tenantId: admin.tenantId,
    openAbsenceRequests,
    openPrivacyRequests,
    activeEmployees,
    auditToday,
    compensationCasesOpen,
    compensationCasesOverdue,
    openWeeksWithPastSunday,
    hasCurrentWeek: Boolean(currentWeek),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Übersicht"
        title="Dashboard"
        description="Kennzahlen, offene Abwesenheits- und Datenschutzanträge sowie der Status der aktuellen Woche auf einen Blick."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <KpiCard
          label="Offene Abwesenheiten"
          value={openAbsenceRequests.toString()}
          href="/absences"
          icon={FileClock}
          hint="Wartet auf Entscheid"
        />
        <KpiCard
          label="Datenschutz offen"
          value={openPrivacyRequests.toString()}
          href="/privacy"
          icon={Lock}
          hint="Auskunft / Löschung"
        />
        <KpiCard
          label="Offene Wochen mit Vergangenheit"
          value={openWeeksWithPastSunday.toString()}
          href="/planning"
          icon={CalendarRange}
          hint="Bitte Wochen veröffentlichen oder abschließen"
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
        <CompensationCasesKpi
          openCount={compensationCasesOpen}
          overdueCount={compensationCasesOverdue}
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
