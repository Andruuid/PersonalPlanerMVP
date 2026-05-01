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
          <Link
            className="text-sm text-neutral-600 hover:text-neutral-900"
            href="/system-admin/tenants"
          >
            Zurück zur Mandantenliste
          </Link>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
            >
              Abmelden
            </button>
          </form>
        </div>
        <h2 className="text-2xl font-semibold text-neutral-900">{tenant.name}</h2>
        <p className="text-sm text-neutral-600">Slug: {tenant.slug}</p>
      </div>

      <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-5 text-sm shadow-sm md:grid-cols-3">
        <div>
          <p className="text-neutral-500">Mitarbeitende (Anzahl)</p>
          <p className="text-lg font-semibold text-neutral-900">{tenant.stats.employeeCount}</p>
        </div>
        <div>
          <p className="text-neutral-500">Wochen (Anzahl)</p>
          <p className="text-lg font-semibold text-neutral-900">{tenant.stats.weekCount}</p>
        </div>
        <div>
          <p className="text-neutral-500">Storage (geschätzt)</p>
          <p className="text-lg font-semibold text-neutral-900">
            {formatBytes(tenant.stats.storageBytesEstimated)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm shadow-sm">
        <p className="text-neutral-500">Initialer Kunden-Admin</p>
        <p className="font-medium text-neutral-900">
          {tenant.initialAdminEmail ?? "Nicht vorhanden"}
        </p>
        <p className="mt-2 text-xs text-neutral-500">
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
