import Link from "next/link";
import { NewTenantForm } from "./new-tenant-form";

export const metadata = { title: "Neuer Mandant · System-Admin" };

export default function NewSystemAdminTenantPage() {
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
        <h2 className="text-2xl font-semibold text-neutral-900">Neuen Mandanten anlegen</h2>
        <p className="text-sm text-neutral-600">
          Erstellt Betrieb + initialen Kunden-Admin ohne Mailversand (MVP).
        </p>
      </div>
      <NewTenantForm />
    </section>
  );
}
