import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Dashboard · PersonalPlaner" };

export default function DashboardPage() {
  return (
    <PagePlaceholder
      caption="Übersicht"
      title="Dashboard"
      description="Kennzahlen, offene Anträge und der Status der aktuellen Woche auf einen Blick."
      phase="Phase 3"
    />
  );
}
