import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Anmelden · PersonalPlaner",
};

interface PageProps {
  searchParams: Promise<{ callbackUrl?: string; reason?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const showSessionStaleHint = params.reason === "session_stale";
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F7FB] px-4 py-10">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            PersonalPlaner
          </p>
          <CardTitle className="text-2xl">Anmelden</CardTitle>
          <CardDescription>
            Personalplanung &amp; Zeitkonten für Ihren Betrieb
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showSessionStaleHint ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Ihre Sitzung ist nicht mehr gueltig (z. B. nach einer Secret-Aenderung).
              Bitte melden Sie sich neu an. Wenn das Problem bleibt, loeschen Sie
              Cookies/Browserdaten fuer diese Seite und versuchen Sie es erneut.
            </div>
          ) : null}
          <LoginForm callbackUrl={params.callbackUrl} />
        </CardContent>
      </Card>
    </div>
  );
}
