import { format } from "date-fns";
import { prisma } from "@/lib/db";
import { decidePrivacyRequestFormAction } from "@/server/privacy";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdmin } from "@/server/_shared";

export const metadata = { title: "Datenschutz-Anfragen · PersonalPlaner" };

export default async function PrivacyAdminPage() {
  const admin = await requireAdmin();
  const requests = await prisma.privacyRequest.findMany({
    where: { tenantId: admin.tenantId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      employee: { select: { firstName: true, lastName: true } },
      decidedBy: { select: { email: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Datenschutz"
        title="DSGVO/DSG-Anfragen"
        description="Verwalte Auskunfts- und Löschanträge von Mitarbeitenden."
      />

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-neutral-700">Mitarbeiter:in</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-700">Typ</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-700">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-700">Erstellt</th>
              <th className="px-4 py-3 text-left font-semibold text-neutral-700">Entscheid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-neutral-800">
                  {r.employee.firstName} {r.employee.lastName}
                </td>
                <td className="px-4 py-3 text-neutral-700">{r.type}</td>
                <td className="px-4 py-3 text-neutral-700">{r.status}</td>
                <td className="px-4 py-3 text-neutral-700">
                  {format(r.createdAt, "dd.MM.yyyy HH:mm")}
                </td>
                <td className="px-4 py-3">
                  {r.status === "OPEN" ? (
                    <div className="flex gap-2">
                      <form action={decidePrivacyRequestFormAction}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <input type="hidden" name="status" value="APPROVED" />
                        <button className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500">
                          Genehmigen
                        </button>
                      </form>
                      <form action={decidePrivacyRequestFormAction}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <input type="hidden" name="status" value="REJECTED" />
                        <button className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-500">
                          Ablehnen
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-500">
                      {r.decidedBy?.email ?? "—"}
                      {r.decidedAt ? ` · ${format(r.decidedAt, "dd.MM.yyyy HH:mm")}` : ""}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                  Keine Datenschutz-Anfragen vorhanden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
