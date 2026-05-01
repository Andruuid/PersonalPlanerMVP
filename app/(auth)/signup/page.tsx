import { redirect } from "next/navigation";

export const metadata = {
  title: "Betrieb registrieren · PersonalPlaner",
};

export default function SignupPage() {
  redirect("/system-admin/tenants/new");
}
