import { PageHeader } from "@/components/admin/page-header";
import { UsersTable } from "@/components/admin/users/users-table";
import { requireAdmin } from "@/server/_shared";
import { loadAdminUsers } from "@/server/users-admin";

export const metadata = { title: "Rechte und Benutzer · PersonalPlaner" };

export default async function UsersPage() {
  const admin = await requireAdmin();
  const users = await loadAdminUsers();

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Verwaltung"
        title="Rechte und Benutzer"
        description="Benutzerkonten des Mandanten einsehen, sperren/entsperren, Rollen wechseln und Passwort zurücksetzen."
      />
      <UsersTable users={users} currentUserId={admin.id} />
    </div>
  );
}
