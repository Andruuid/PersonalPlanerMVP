import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Verfügbarkeit · PersonalPlaner" };

export default function AvailabilityPage() {
  return (
    <PagePlaceholder
      caption="Selbstverwaltung"
      title="Verfügbarkeit"
      description="Eigene Verfügbarkeiten und Wunschdienste hinterlegen."
      phase="Spätere Phase"
    />
  );
}
