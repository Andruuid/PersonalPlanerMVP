import { CalendarDays, FileClock, ShieldCheck, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { listAuditLogs } from "@/lib/audit";
import { currentIsoWeek } from "@/lib/time/week";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "@/components/admin/dashboard/kpi-card";
import { RecentActivity } from "@/components/admin/dashboard/recent-activity";
import type { WeekStatus } from "@/lib/generated/prisma/enums";

export const metadata = { title: "Dashboard · PersonalPlaner" };

const WEEK_STATUS_LABEL: Record<WeekStatus, string> = {
  DRAFT: "Entwurf",
  PUBLISHED: "Veröffentlicht",
  CLOSED: "Abgeschlossen",
};

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export default async function DashboardPage() {
  const isoWeek = currentIsoWeek();
  const today = startOfToday();

  const [openRequests, currentWeek, activeEmployees, auditToday, recentList] =
    await Promise.all([
      prisma.absenceRequest.count({ where: { status: "OPEN" } }),
      prisma.week.findUnique({
        where: {
          year_weekNumber: {
            year: isoWeek.year,
            weekNumber: isoWeek.weekNumber,
          },
        },
        select: { status: true },
      }),
      prisma.employee.count({ where: { isActive: true } }),
      prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      listAuditLogs(prisma, {}, { page: 1, pageSize: 5 }),
    ]);

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
