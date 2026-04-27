import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/shell/app-shell";
import { QuickActionsProvider } from "@/components/admin/quick-actions-provider";

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

  const locations = await prisma.location.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <QuickActionsProvider
      locations={locations}
      defaultLocationId={locations[0]?.id ?? ""}
    >
      <AppShell
        variant="admin"
        email={session.user.email ?? ""}
        showRoleToggle
      >
        {children}
      </AppShell>
    </QuickActionsProvider>
  );
}
