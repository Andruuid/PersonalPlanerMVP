import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/shell/app-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/my-week");
  }

  return (
    <AppShell
      variant="admin"
      email={session.user.email ?? ""}
      showRoleToggle
    >
      {children}
    </AppShell>
  );
}
