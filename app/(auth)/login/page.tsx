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
  searchParams: Promise<{ callbackUrl?: string; tenantSlug?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
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
          <LoginForm
            callbackUrl={params.callbackUrl}
            defaultTenantSlug={params.tenantSlug}
          />
        </CardContent>
      </Card>
    </div>
  );
}
