import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Meine Konten · PersonalPlaner" };

export default function MyAccountsPage() {
  return (
    <PagePlaceholder
      caption="Konten"
      title="Meine Konten"
      description="Zeitsaldo, Ferienstand und TZT als Kachel-Übersicht mit Buchungs-Historie."
      phase="Phase 5"
    />
  );
}
