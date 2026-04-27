import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Audit-Log · PersonalPlaner" };

export default function AuditPage() {
  return (
    <PagePlaceholder
      caption="Sicherheit"
      title="Audit-Log"
      description="Nachvollziehbare Historie aller Änderungen — gefiltert nach Benutzer, Entität oder Aktion."
      phase="Phase 6"
    />
  );
}
