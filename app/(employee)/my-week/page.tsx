import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Meine Woche · PersonalPlaner" };

export default function MyWeekPage() {
  return (
    <PagePlaceholder
      caption="Aktuelle veröffentlichte Woche"
      title="Meine Woche"
      description="Tageskarten mit Diensten, Pausen und Statusübersicht — folgt in Phase 4."
      phase="Phase 4"
    />
  );
}
