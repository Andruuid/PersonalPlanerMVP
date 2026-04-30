import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/shell/app-shell";
import { QuickActionsProvider } from "@/components/admin/quick-actions-provider";
import { hasMultipleTenants } from "@/lib/permissions";

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
  const canSwitchTenant = session.user.email
    ? await hasMultipleTenants(session.user.email)
    : false;

  const [locations, employees, tenantForForms] = await Promise.all([
    prisma.location.findMany({
      where: { tenantId: session.user.tenantId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.user.tenantId, isActive: true, deletedAt: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, roleLabel: true },
    }),
    prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: {
        defaultWeeklyTargetMinutes: true,
        defaultHazMinutesPerWeek: true,
      },
    }),
  ]);

  const employeeOptions = employees.map((e) => ({
    id: e.id,
    label: `${e.firstName} ${e.lastName}${e.roleLabel ? ` · ${e.roleLabel}` : ""}`,
  }));

  const tenantTimeDefaults = {
    defaultWeeklyTargetMinutes: tenantForForms?.defaultWeeklyTargetMinutes ?? 2520,
    defaultHazMinutesPerWeek: tenantForForms?.defaultHazMinutesPerWeek ?? 2700,
  };

  return (
    <QuickActionsProvider
      locations={locations}
      defaultLocationId={locations[0]?.id ?? ""}
      employees={employeeOptions}
      tenantTimeDefaults={tenantTimeDefaults}
    >
      <AppShell
        variant="admin"
        email={session.user.email ?? ""}
        canSwitchTenant={canSwitchTenant}
        showRoleToggle
      >
        {children}
      </AppShell>
    </QuickActionsProvider>
  );
}
