import Link from "next/link";
import { listSystemAdminTenants } from "@/server/system-admin/tenants";

export const metadata = { title: "Mandanten · System-Admin" };

function formatDate(iso: string | null): string {
  if (!iso) return "Keine Aktivität";
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

const STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv",
  DEAKTIVIERT: "Deaktiviert",
  ARCHIVIERT: "Archiviert",
};

export default async function SystemAdminTenantsPage() {
  const tenants = await listSystemAdminTenants();

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">Plattform</p>
          <h2 className="text-2xl font-semibold text-neutral-900">Mandantenverwaltung</h2>
        </div>
        <Link
          href="/system-admin/tenants/new"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Neuer Mandant
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-600">
            <tr>
              <th className="px-4 py-3">Betrieb</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Mitarbeitende</th>
              <th className="px-4 py-3">Letzte Aktivität</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-neutral-900">{tenant.name}</p>
                  <p className="text-xs text-neutral-500">{tenant.slug}</p>
                </td>
                <td className="px-4 py-3">{STATUS_LABEL[tenant.status] ?? tenant.status}</td>
                <td className="px-4 py-3">{tenant.employeeCount}</td>
                <td className="px-4 py-3">{formatDate(tenant.lastActivityAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    className="font-medium text-neutral-700 hover:text-neutral-900"
                    href={`/system-admin/tenants/${tenant.id}`}
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))}
            {tenants.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={5}>
                  Noch keine Mandanten vorhanden.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
