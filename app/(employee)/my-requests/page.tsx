import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Meine Anträge · PersonalPlaner" };

export default function MyRequestsPage() {
  return (
    <PagePlaceholder
      caption="Status"
      title="Meine Anträge"
      description="Eigene Wünsche und Anträge inklusive Genehmigung-Status."
      phase="Phase 4"
    />
  );
}
