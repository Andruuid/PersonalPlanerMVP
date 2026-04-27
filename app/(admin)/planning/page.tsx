import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Wochenplanung · PersonalPlaner" };

export default function PlanningPage() {
  return (
    <PagePlaceholder
      caption="KW · Standort"
      title="Wochenplanung"
      description="Drag-and-drop-Wochenraster, Detailfenster und offene Anträge — folgt in Phase 3."
      phase="Phase 3"
    />
  );
}
