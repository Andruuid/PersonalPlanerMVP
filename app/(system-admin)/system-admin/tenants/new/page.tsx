import Link from "next/link";
import { NewTenantForm } from "./new-tenant-form";

export const metadata = { title: "Neuer Mandant · System-Admin" };

export default function NewSystemAdminTenantPage() {
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
        <h2 className="text-2xl font-semibold">Neuen Mandanten anlegen</h2>
        <p className="text-sm text-slate-400">
          Erstellt Betrieb + initialen Kunden-Admin ohne Mailversand (MVP).
        </p>
      </div>
      <NewTenantForm />
    </section>
  );
}
