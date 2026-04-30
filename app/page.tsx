import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { homePathForRole } from "@/lib/auth-home-path";

export default async function RootPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.pendingTenantSelection) {
    redirect("/select-tenant");
  }
  redirect(homePathForRole(session.user.role));
}
