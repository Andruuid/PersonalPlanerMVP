import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadMyRequests } from "@/lib/employee/data";
import { RequestStack } from "@/components/employee/request-stack";
import { StatusList } from "@/components/employee/status-list";
import {
  REQUEST_STATUS_LABELS,
  type MyRequestView,
  type RequestStatus,
} from "@/components/employee/types";
import { createPrivacyRequestFormAction } from "@/server/privacy";

export const metadata = { title: "Meine Anträge · PersonalPlaner" };

const STATUS_ORDER: RequestStatus[] = ["OPEN", "APPROVED", "REJECTED"];

export default async function MyRequestsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!session.user.employeeId) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900">
          Kein Mitarbeitenden-Profil verknüpft
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
          Bitte wende dich an die Geschäftsleitung — dein Login ist nicht mit
          einem Mitarbeitenden-Profil verknüpft.
        </p>
      </section>
    );
  }

  const employee = await prisma.employee.findFirst({
    where: {
      id: session.user.employeeId,
      tenantId: session.user.tenantId,
      deletedAt: null,
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) redirect("/login");

  const all = await loadMyRequests(session.user, employee.id);
  const groups = groupByStatus(all);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-6">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Meine Wünsche und Anträge
          </p>
          <h1 className="text-2xl font-semibold text-neutral-900 md:text-3xl">
            Meine Anträge
          </h1>
          <p className="max-w-2xl text-sm text-neutral-600">
            Alle eingereichten Wünsche im Überblick. Offene Anträge kannst du
            jederzeit zurückziehen, solange sie noch nicht entschieden wurden.
          </p>
        </header>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <header className="mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
              Schnell beantragen
            </h2>
            <p className="text-xs text-neutral-500">
              Antrag wählen — die Geschäftsleitung erhält ihn umgehend zur
              Prüfung.
            </p>
          </header>
          <RequestStack variant="inline" />
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <header className="mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
              Datenschutz (DSGVO/DSG)
            </h2>
            <p className="text-xs text-neutral-500">
              Exportiere deine gespeicherten Daten oder stelle einen Löschantrag.
            </p>
          </header>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/dsgvo/export"
              className="inline-flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Daten-Auskunft exportieren
            </a>
            <form action={createPrivacyRequestFormAction}>
              <input type="hidden" name="type" value="ERASURE" />
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Löschantrag stellen
              </button>
            </form>
          </div>
        </section>

        <div className="space-y-6">
          {STATUS_ORDER.map((status) => (
            <section key={status} className="space-y-3">
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
                  {REQUEST_STATUS_LABELS[status]}
                </h2>
                <span className="text-xs text-neutral-500">
                  {groups[status].length}
                </span>
              </header>
              <StatusList
                requests={groups[status]}
                emptyHint={emptyHintFor(status)}
              />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function groupByStatus(
  requests: MyRequestView[],
): Record<RequestStatus, MyRequestView[]> {
  const out: Record<RequestStatus, MyRequestView[]> = {
    OPEN: [],
    APPROVED: [],
    REJECTED: [],
  };
  for (const r of requests) out[r.status].push(r);
  return out;
}

function emptyHintFor(status: RequestStatus): string {
  switch (status) {
    case "OPEN":
      return "Aktuell sind keine Anträge offen.";
    case "APPROVED":
      return "Noch keine genehmigten Anträge.";
    case "REJECTED":
      return "Bisher wurde kein Antrag abgelehnt.";
  }
}
