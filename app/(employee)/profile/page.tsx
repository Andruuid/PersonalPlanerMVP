import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = { title: "Profil · PersonalPlaner" };

export default function ProfilePage() {
  return (
    <PagePlaceholder
      caption="Persönlich"
      title="Profil"
      description="Eigene Stammdaten und Passwortänderung."
      phase="Spätere Phase"
    />
  );
}
