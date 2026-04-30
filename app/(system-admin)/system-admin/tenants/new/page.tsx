import Link from "next/link";
import { NewTenantForm } from "./new-tenant-form";

export const metadata = { title: "Neuer Mandant · System-Admin" };

export default function NewSystemAdminTenantPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <Link className="text-sm text-cyan-300 hover:text-cyan-200" href="/system-admin/tenants">
          Zurück zur Mandantenliste
        </Link>
        <h2 className="text-2xl font-semibold">Neuen Mandanten anlegen</h2>
        <p className="text-sm text-slate-400">
          Erstellt Betrieb + initialen Kunden-Admin ohne Mailversand (MVP).
        </p>
      </div>
      <NewTenantForm />
    </section>
  );
}
