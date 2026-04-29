import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignupForm } from "./signup-form";

export const metadata = {
  title: "Betrieb registrieren · PersonalPlaner",
};

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            PersonalPlaner
          </p>
          <CardTitle className="text-2xl">Neuen Betrieb registrieren</CardTitle>
          <CardDescription>
            Legen Sie Ihren Mandanten mit Standard-Stammdaten an und melden Sie
            sich anschliessend als Admin an.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
      </Card>
    </div>
  );
}
