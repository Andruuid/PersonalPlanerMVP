import { format } from "date-fns";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdmin } from "@/server/_shared";
import type { CompensationCaseStatus } from "@/lib/generated/prisma/enums";

export const metadata = {
  title: "Sonn-/Feiertagskompensation · PersonalPlaner",
};

const STATUS_LABEL: Record<CompensationCaseStatus, string> = {
  OPEN: "Offen",
  REDEEMED: "Ausgeglichen",
  EXPIRED: "Abgelaufen",
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function CompensationCasesPage({ searchParams }: PageProps) {
  const admin = await requireAdmin();
  const raw = await searchParams;
  const filterStatus = raw.status;
  const statusWhere: CompensationCaseStatus | undefined =
    filterStatus === "OPEN" ||
    filterStatus === "REDEEMED" ||
    filterStatus === "EXPIRED"
      ? filterStatus
      : undefined;

  const rows = await prisma.compensationCase.findMany({
    where: {
      tenantId: admin.tenantId,
      ...(statusWhere ? { status: statusWhere } : {}),
    },
    orderBy: [{ dueAt: "asc" }, { triggerDate: "asc" }],
    include: {
      employee: { select: { firstName: true, lastName: true } },
    },
  });

  const baseHref = "/compensation-cases";

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Compliance"
        title="Sonn-/Feiertagskompensation"
        description="Fristenbezogene Fälle zur Feiertagsarbeit bis 5 Stunden und Ausgleich über das SFK-Konto. Filter über die Adresszeile, z.&nbsp;B. ?status=OPEN für nur offene Fälle."
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href={baseHref}
          className="rounded-full border border-neutral-200 bg-white px-3 py-1 font-medium text-neutral-800 hover:bg-neutral-50"
        >
          Alle Status
        </Link>
        <Link
          href={`${baseHref}?status=OPEN`}
          className="rounded-full border border-neutral-200 bg-white px-3 py-1 font-medium text-neutral-800 hover:bg-neutral-50"
        >
          Nur offen
        </Link>
        <Link
          href={`${baseHref}?status=EXPIRED`}
          className="rounded-full border border-neutral-200 bg-white px-3 py-1 font-medium text-neutral-800 hover:bg-neutral-50"
        >
          Abgelaufen
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
            <tr>
              <th className="px-4 py-3">Mitarbeitende:r</th>
              <th className="px-4 py-3">Auslösende Arbeit</th>
              <th className="px-4 py-3 tabular-nums">Minuten</th>
              <th className="px-4 py-3">Frist Ende</th>
              <th className="px-4 py-3">Ausgleich am</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-neutral-500"
                  colSpan={6}
                >
                  Keine Einträge.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const name = `${r.employee.firstName} ${r.employee.lastName}`;
                return (
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {name}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-neutral-800">
                      {format(r.triggerDate, "dd.MM.yyyy")}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.holidayWorkMinutes}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {format(r.dueAt, "dd.MM.yyyy")}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-neutral-700">
                      {r.redeemedAt ? format(r.redeemedAt, "dd.MM.yyyy") : "–"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          r.status === "OPEN"
                            ? "rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-900"
                            : r.status === "EXPIRED"
                              ? "rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-900"
                              : "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900"
                        }
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        Daten werden beim Wochenabschluss aus Plan (Feiertagsarbeit bis 5 h)
        aktualisiert; Ausgleich zählen Buchungen vom Typ Bezug SFK-Konto.
      </p>
    </div>
  );
}
