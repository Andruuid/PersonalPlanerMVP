import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  // Admins keep access so they can preview the Mitarbeiter-Ansicht.
  const showRoleToggle = session.user.role === "ADMIN";

  return (
    <AppShell
      variant="employee"
      email={session.user.email ?? ""}
      showRoleToggle={showRoleToggle}
    >
      {children}
    </AppShell>
  );
}
