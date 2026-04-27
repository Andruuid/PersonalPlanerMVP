import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Einstellungen · PersonalPlaner" };

export default function SettingsPage() {
  return (
    <PagePlaceholder
      caption="Konfiguration"
      title="Einstellungen"
      description="Standorte, Feiertage und Unternehmensdaten pflegen."
      phase="Phase 2"
    />
  );
}
