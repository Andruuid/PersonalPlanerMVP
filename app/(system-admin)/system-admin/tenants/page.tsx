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
          <p className="text-xs uppercase tracking-wider text-slate-400">Plattform</p>
          <h2 className="text-2xl font-semibold">Mandantenverwaltung</h2>
        </div>
        <Link
          href="/system-admin/tenants/new"
          className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400"
        >
          Neuer Mandant
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/70 text-left text-slate-400">
            <tr>
              <th className="px-4 py-3">Betrieb</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Mitarbeitende</th>
              <th className="px-4 py-3">Letzte Aktivität</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-100">{tenant.name}</p>
                  <p className="text-xs text-slate-400">{tenant.slug}</p>
                </td>
                <td className="px-4 py-3">{STATUS_LABEL[tenant.status] ?? tenant.status}</td>
                <td className="px-4 py-3">{tenant.employeeCount}</td>
                <td className="px-4 py-3">{formatDate(tenant.lastActivityAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    className="text-cyan-300 hover:text-cyan-200"
                    href={`/system-admin/tenants/${tenant.id}`}
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))}
            {tenants.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-400" colSpan={5}>
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
