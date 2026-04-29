import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

  let employeeHeadingName: string | null = null;
  if (session.user.role === "EMPLOYEE") {
    const emp = await prisma.employee.findFirst({
      where: {
        userId: session.user.id,
        tenantId: session.user.tenantId,
        deletedAt: null,
      },
      select: { firstName: true, lastName: true },
    });
    if (emp) {
      const full = `${emp.firstName} ${emp.lastName}`.trim();
      employeeHeadingName =
        full || (session.user.email?.trim() ?? null);
    } else {
      employeeHeadingName = session.user.email?.trim() ?? null;
    }
  }

  return (
    <AppShell
      variant="employee"
      email={session.user.email ?? ""}
      showRoleToggle={showRoleToggle}
      employeeHeadingName={employeeHeadingName}
    >
      {children}
    </AppShell>
  );
}
