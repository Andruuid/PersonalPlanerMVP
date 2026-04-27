import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Mitarbeitende · PersonalPlaner" };

export default function EmployeesPage() {
  return (
    <PagePlaceholder
      caption="Stammdaten"
      title="Mitarbeitende"
      description="Anlegen, bearbeiten und deaktivieren von Mitarbeitenden inklusive Pensum und Ferienanspruch."
      phase="Phase 2"
    />
  );
}
