import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSystemAdminTenantDetail,
} from "@/server/system-admin/tenants";
import { TenantDetailActions } from "./tenant-detail-actions";

export const metadata = { title: "Mandantendetail · System-Admin" };

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default async function SystemAdminTenantDetailPage({ params }: PageProps) {
  const { id } = await params;
  const tenant = await getSystemAdminTenantDetail(id);
  if (!tenant) notFound();

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/system-admin/tenants">
            Zurück zur Mandantenliste
          </Link>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Abmelden
            </button>
          </form>
        </div>
        <h2 className="text-2xl font-semibold">{tenant.name}</h2>
        <p className="text-sm text-slate-400">Slug: {tenant.slug}</p>
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm md:grid-cols-3">
        <div>
          <p className="text-slate-400">Mitarbeitende (Anzahl)</p>
          <p className="text-lg font-semibold">{tenant.stats.employeeCount}</p>
        </div>
        <div>
          <p className="text-slate-400">Wochen (Anzahl)</p>
          <p className="text-lg font-semibold">{tenant.stats.weekCount}</p>
        </div>
        <div>
          <p className="text-slate-400">Storage (geschätzt)</p>
          <p className="text-lg font-semibold">{formatBytes(tenant.stats.storageBytesEstimated)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-sm">
        <p className="text-slate-400">Initialer Kunden-Admin</p>
        <p className="font-medium">{tenant.initialAdminEmail ?? "Nicht vorhanden"}</p>
        <p className="mt-2 text-xs text-slate-500">
          Es werden keine personenbezogenen Mitarbeitendendaten angezeigt.
        </p>
      </div>

      <TenantDetailActions
        tenantId={tenant.id}
        initial={{
          name: tenant.name,
          slug: tenant.slug,
          defaultWeeklyTargetMinutes: tenant.defaultWeeklyTargetMinutes,
          defaultHazMinutesPerWeek: tenant.defaultHazMinutesPerWeek,
          deletedAt: tenant.deletedAt,
        }}
      />
    </section>
  );
}
