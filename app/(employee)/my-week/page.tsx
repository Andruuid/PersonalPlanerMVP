import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { currentIsoWeek, shiftWeek } from "@/lib/time/week";
import { loadMyWeek } from "@/lib/employee/my-week";
import { loadMyAccounts, loadMyRequests } from "@/lib/employee/data";
import { DayCard } from "@/components/employee/day-card";
import { AccountsPanel } from "@/components/employee/accounts-panel";
import { RequestStack } from "@/components/employee/request-stack";
import { StatusList } from "@/components/employee/status-list";
import { AdminEmployeePreviewPicker } from "@/components/employee/admin-employee-preview-picker";
import { loadEmployeesForPreviewPicker } from "@/lib/employee/admin-preview-picker";

export const metadata = { title: "Meine Woche · PersonalPlaner" };

interface PageProps {
  searchParams: Promise<{ year?: string; week?: string; employee?: string }>;
}

function pickWeek(raw: { year?: string; week?: string }): {
  year: number;
  weekNumber: number;
} {
  const fallback = currentIsoWeek();
  const year = Number.parseInt(raw.year ?? "", 10);
  const weekNumber = Number.parseInt(raw.week ?? "", 10);
  if (
    Number.isFinite(year) &&
    Number.isFinite(weekNumber) &&
    weekNumber >= 1 &&
    weekNumber <= 53 &&
    year >= 2000 &&
    year <= 2100
  ) {
    return { year, weekNumber };
  }
  return fallback;
}

export default async function MyWeekPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const pickedEarly = pickWeek(params);
  const isAdminPreview =
    session.user.role === "ADMIN" && Boolean(params.employee);

  if (session.user.role === "ADMIN" && !params.employee) {
    const employees = await loadEmployeesForPreviewPicker(session.user.tenantId);
    return (
      <AdminEmployeePreviewPicker
        title="Mitarbeiter:in für die Vorschau wählen"
        description="Du siehst die Oberfläche wie die ausgewählte Person — ohne schreibende Aktionen in ihrem Namen."
        employees={employees}
        route="/my-week"
        preserveParams={{
          year: String(pickedEarly.year),
          week: String(pickedEarly.weekNumber),
        }}
      />
    );
  }

  const employee = await prisma.employee.findFirst({
    where: isAdminPreview
      ? { id: params.employee, tenantId: session.user.tenantId, deletedAt: null }
      : { userId: session.user.id, tenantId: session.user.tenantId, deletedAt: null },
    include: {
      location: { select: { id: true, name: true } },
    },
  });

  if (!employee) {
    if (isAdminPreview) {
      return (
        <EmptyState
          title="Mitarbeiter:in nicht gefunden"
          description="Die gewählte Person gehört nicht zu diesem Betrieb oder ist nicht mehr aktiv. Bitte wähle erneut aus der Liste."
        />
      );
    }
    return (
      <EmptyState
        title="Kein Mitarbeitenden-Profil verknüpft"
        description="Bitte wende dich an die Geschäftsleitung — dein Login ist nicht mit einem Mitarbeitenden-Profil verknüpft."
      />
    );
  }

  const current = currentIsoWeek();
  const picked = pickWeek(params);
  const { header, days } = await loadMyWeek(
    session.user,
    employee.id,
    employee.locationId,
    current,
    { year: picked.year, weekNumber: picked.weekNumber },
  );

  const [accounts, requests] = await Promise.all([
    loadMyAccounts(session.user, employee.id, picked.year),
    loadMyRequests(session.user, employee.id, { limit: 5 }),
  ]);

  const prevWeek = shiftWeek(picked, -1);
  const nextWeek = shiftWeek(picked, 1);

  const previewBase = isAdminPreview ? `&employee=${employee.id}` : "";

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Aktuelle veröffentlichte Woche · {employee.location.name}
            </p>
            <h1 className="text-2xl font-semibold text-neutral-900 md:text-3xl">
              {isAdminPreview
                ? `Woche von ${employee.firstName} ${employee.lastName}`
                : "Meine Woche"}
            </h1>
            <p className="text-sm text-neutral-600">
              KW {header.weekNumber} · {header.year}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/my-week?year=${prevWeek.year}&week=${prevWeek.weekNumber}${previewBase}`}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Vorherige
            </Link>
            <Link
              href={`/my-week?year=${current.year}&week=${current.weekNumber}${previewBase}`}
              className="inline-flex h-9 items-center rounded-md border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-50"
            >
              Aktuelle
            </Link>
            <Link
              href={`/my-week?year=${nextWeek.year}&week=${nextWeek.weekNumber}${previewBase}`}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-50"
            >
              Nächste
              <ChevronRight className="h-4 w-4" />
            </Link>
            <PublishedBadge
              hasSnapshot={header.hasSnapshot}
              status={header.status}
            />
          </div>
        </header>

        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
              Meine Einsätze
            </h2>
            <span className="text-xs text-neutral-500">
              {days.filter((d) => d.shiftKey !== "EMPTY" && d.shiftKey !== "FREI").length}{" "}
              von 7 Tagen
            </span>
          </header>

          {!header.hasSnapshot ? (
            <UnpublishedHint />
          ) : (
            <ul className="space-y-2.5">
              {days.map((d) => (
                <li key={d.iso}>
                  <DayCard day={d} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
              Statusübersicht
            </h2>
            <Link
              href={
                isAdminPreview
                  ? `/my-requests?employee=${employee.id}`
                  : "/my-requests"
              }
              className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
            >
              Alle Anträge ansehen →
            </Link>
          </header>
          <StatusList
            requests={requests}
            emptyHint="Du hast noch keine Anträge gestellt — nutze die Buttons rechts, um Ferien, Frei oder TZT zu beantragen."
            showCancel={!isAdminPreview}
          />
        </section>
      </div>

      <aside className="w-full shrink-0 space-y-4 lg:w-80 xl:w-96">
        <AccountsPanel accounts={accounts} />
        {!isAdminPreview ? (
          <RequestStack tztModel={employee.tztModel} />
        ) : null}
      </aside>
    </div>
  );
}

function PublishedBadge({
  hasSnapshot,
  status,
}: {
  hasSnapshot: boolean;
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
}) {
  if (!hasSnapshot) {
    return (
      <Badge className="bg-neutral-100 text-neutral-700">
        Noch nicht veröffentlicht
      </Badge>
    );
  }
  if (status === "CLOSED") {
    return (
      <Badge className="bg-slate-200 text-slate-800">Abgeschlossen</Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-800">Veröffentlicht</Badge>
  );
}

function UnpublishedHint() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-neutral-200 bg-white p-5 shadow-sm">
      <CalendarClock className="mt-0.5 h-5 w-5 text-neutral-400" />
      <div>
        <p className="text-sm font-medium text-neutral-900">
          Diese Woche ist noch nicht veröffentlicht.
        </p>
        <p className="text-sm text-neutral-600">
          Sobald die Geschäftsleitung den Plan veröffentlicht, erscheinen deine
          Tage hier. Wünsche kannst du jederzeit über die Buttons rechts
          einreichen.
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <p className="mx-auto max-w-md text-sm text-neutral-600">
        {description}
      </p>
    </section>
  );
}
