import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadMyRequests, loadMyShiftWishes, loadServiceTemplatesForShiftWish } from "@/lib/employee/data";
import { RequestStack } from "@/components/employee/request-stack";
import { StatusList } from "@/components/employee/status-list";
import { ShiftWishStatusList } from "@/components/employee/shift-wish-status-list";
import { AdminEmployeePreviewPicker } from "@/components/employee/admin-employee-preview-picker";
import { loadEmployeesForPreviewPicker } from "@/lib/employee/admin-preview-picker";
import {
  REQUEST_STATUS_LABELS,
  type MyRequestView,
  type MyShiftWishView,
  type RequestStatus,
} from "@/components/employee/types";
import type { PrivacyRequestStatus } from "@/lib/generated/prisma/enums";
import { PrivacyErasureButton } from "@/components/employee/privacy-erasure-button";

export const metadata = { title: "Meine Anträge · PersonalPlaner" };

interface PageProps {
  searchParams: Promise<{ employee?: string }>;
}

const STATUS_ORDER: RequestStatus[] = ["OPEN", "APPROVED", "REJECTED", "WITHDRAWN"];

export default async function MyRequestsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const isAdminPreview =
    session.user.role === "ADMIN" && Boolean(params.employee);

  if (session.user.role === "ADMIN" && !params.employee) {
    const employees = await loadEmployeesForPreviewPicker(session.user.tenantId);
    return (
      <AdminEmployeePreviewPicker
        title="Mitarbeiter:in für die Anträge-Vorschau wählen"
        description="Du siehst eingereichte Wünsche und Anträge der ausgewählten Person — nur zur Ansicht."
        employees={employees}
        route="/my-requests"
      />
    );
  }

  const employee = isAdminPreview
    ? await prisma.employee.findFirst({
        where: {
          id: params.employee,
          tenantId: session.user.tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          tztModel: true,
        },
      })
    : await prisma.employee.findFirst({
        where: {
          id: session.user.employeeId ?? "",
          tenantId: session.user.tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          tztModel: true,
        },
      });

  if (!employee) {
    if (isAdminPreview) {
      return (
        <section className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-neutral-900">
            Mitarbeiter:in nicht gefunden
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
            Die gewählte Person gehört nicht zu diesem Betrieb oder ist nicht
            mehr aktiv.
          </p>
        </section>
      );
    }
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

  const [all, shiftWishes, serviceTemplates] = await Promise.all([
    loadMyRequests(session.user, employee.id),
    loadMyShiftWishes(session.user, employee.id),
    loadServiceTemplatesForShiftWish(session.user.tenantId),
  ]);
  const privacyRequests = isAdminPreview
    ? []
    : await prisma.privacyRequest.findMany({
        where: { employeeId: employee.id, tenantId: session.user.tenantId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, type: true, status: true, createdAt: true },
      });
  const groups = groupByStatus(all);
  const wishGroups = groupShiftWishesByStatus(shiftWishes);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-6">
        <header className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Meine Wünsche und Anträge
          </p>
          <h1 className="text-2xl font-semibold text-neutral-900 md:text-3xl">
            {isAdminPreview
              ? `Anträge von ${employee.firstName} ${employee.lastName}`
              : "Meine Anträge"}
          </h1>
          <p className="max-w-2xl text-sm text-neutral-600">
            {isAdminPreview
              ? "Vorschau: eingereichte Wünsche und Status — ohne Aktionen im Namen dieser Person."
              : "Alle eingereichten Wünsche im Überblick. Offene Anträge kannst du jederzeit zurückziehen, solange sie noch nicht entschieden wurden."}
          </p>
        </header>

        {!isAdminPreview ? (
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
            <RequestStack
              variant="inline"
              tztModel={employee.tztModel}
              serviceTemplates={serviceTemplates}
            />
          </section>
        ) : null}

        {!isAdminPreview ? (
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
              <PrivacyErasureButton />
            </div>
            {privacyRequests.length > 0 ? (
              <ul className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Deine Datenschutz-Anfragen
                </p>
                {privacyRequests.map((pr) => (
                  <li
                    key={pr.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-700"
                  >
                    <span>
                      {pr.type === "ERASURE"
                        ? "Löschantrag"
                        : "Auskunfts-Anfrage"}{" "}
                      · {privacyStatusLabel(pr.status)}
                    </span>
                    <span className="text-neutral-500">
                      {pr.createdAt.toLocaleDateString("de-CH", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <div className="space-y-6">
          <header className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
              Abwesenheitsanträge
            </h2>
            <p className="text-xs text-neutral-500">
              Ferien, Frei, UEZ, TZT und Elternzeit.
            </p>
          </header>
          {STATUS_ORDER.map((status) => (
            <section key={`abs-${status}`} className="space-y-3">
              <header className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  {REQUEST_STATUS_LABELS[status]}
                </h3>
                <span className="text-xs text-neutral-500">
                  {groups[status].length}
                </span>
              </header>
              <StatusList
                requests={groups[status]}
                emptyHint={emptyHintFor(status, isAdminPreview)}
                showCancel={!isAdminPreview}
              />
            </section>
          ))}
        </div>

        <div className="space-y-6">
          <header className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
              Schicht-Wünsche
            </h2>
            <p className="text-xs text-neutral-500">
              Gewünschter Dienst an einem bestimmten Tag — nach Genehmigung im
              Plan.
            </p>
          </header>
          {STATUS_ORDER.map((status) => (
            <section key={`wish-${status}`} className="space-y-3">
              <header className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  {REQUEST_STATUS_LABELS[status]}
                </h3>
                <span className="text-xs text-neutral-500">
                  {wishGroups[status].length}
                </span>
              </header>
              <ShiftWishStatusList
                wishes={wishGroups[status]}
                emptyHint={emptyHintShiftWish(status, isAdminPreview)}
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
    WITHDRAWN: [],
    CANCELLED: [],
  };
  for (const r of requests) out[r.status].push(r);
  return out;
}

function groupShiftWishesByStatus(
  wishes: MyShiftWishView[],
): Record<RequestStatus, MyShiftWishView[]> {
  const out: Record<RequestStatus, MyShiftWishView[]> = {
    OPEN: [],
    APPROVED: [],
    REJECTED: [],
    WITHDRAWN: [],
    CANCELLED: [],
  };
  for (const w of wishes) out[w.status].push(w);
  return out;
}

function emptyHintShiftWish(
  status: RequestStatus,
  preview: boolean,
): string {
  if (preview) {
    switch (status) {
      case "OPEN":
        return "Keine offenen Schicht-Wünsche.";
      case "APPROVED":
        return "Keine genehmigten Schicht-Wünsche.";
      case "REJECTED":
        return "Keine abgelehnten Schicht-Wünsche.";
      case "WITHDRAWN":
        return "Keine zurückgezogenen Schicht-Wünsche.";
      case "CANCELLED":
        return "Keine stornierten Schicht-Wünsche.";
    }
  }
  switch (status) {
    case "OPEN":
      return "Du hast keine offenen Schicht-Wünsche.";
    case "APPROVED":
      return "Noch keine genehmigten Schicht-Wünsche.";
    case "REJECTED":
      return "Kein Schicht-Wunsch wurde abgelehnt.";
    case "WITHDRAWN":
      return "Du hast keine zurückgezogenen Schicht-Wünsche.";
    case "CANCELLED":
      return "Keine stornierten Schicht-Wünsche.";
  }
}

function emptyHintFor(
  status: RequestStatus,
  preview: boolean,
): string {
  if (preview) {
    switch (status) {
      case "OPEN":
        return "Keine offenen Anträge für diese Person.";
      case "APPROVED":
        return "Keine genehmigten Anträge.";
      case "REJECTED":
        return "Keine abgelehnten Anträge.";
      case "WITHDRAWN":
        return "Keine zurückgezogenen Anträge.";
      case "CANCELLED":
        return "Keine stornierten Anträge.";
    }
  }
  switch (status) {
    case "OPEN":
      return "Aktuell sind keine Anträge offen.";
    case "APPROVED":
      return "Noch keine genehmigten Anträge.";
    case "REJECTED":
      return "Bisher wurde kein Antrag abgelehnt.";
    case "WITHDRAWN":
      return "Du hast keine zurückgezogenen Anträge.";
    case "CANCELLED":
      return "Keine stornierten Anträge.";
  }
}

function privacyStatusLabel(status: PrivacyRequestStatus): string {
  switch (status) {
    case "OPEN":
      return "Offen";
    case "APPROVED":
      return "Genehmigt";
    case "REJECTED":
      return "Abgelehnt";
    case "COMPLETED":
      return "Erledigt";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
