import { prisma } from "@/lib/db";
import { isoDateString } from "@/lib/time/week";
import { PageHeader } from "@/components/admin/page-header";
import {
  EmployeesTable,
  type EmployeeRow,
} from "@/components/admin/employees/employees-table";

export const metadata = { title: "Mitarbeitende · PersonalPlaner" };

function dateForInput(d: Date | null | undefined): string {
  if (!d) return "";
  return isoDateString(d);
}

export default async function EmployeesPage() {
  const [employees, locations] = await Promise.all([
    prisma.employee.findMany({
      orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      include: {
        user: { select: { email: true, isActive: true } },
        location: { select: { id: true, name: true } },
      },
    }),
    prisma.location.findMany({ orderBy: { name: "asc" } }),
  ]);

  const rows: EmployeeRow[] = employees.map((e) => ({
    id: e.id,
    email: e.user.email,
    firstName: e.firstName,
    lastName: e.lastName,
    roleLabel: e.roleLabel,
    pensum: e.pensum,
    entryDate: dateForInput(e.entryDate),
    exitDate: e.exitDate ? dateForInput(e.exitDate) : null,
    locationId: e.locationId,
    locationName: e.location.name,
    vacationDaysPerYear: e.vacationDaysPerYear,
    weeklyTargetMinutes: e.weeklyTargetMinutes,
    hazMinutesPerWeek: e.hazMinutesPerWeek,
    tztModel: e.tztModel,
    isActive: e.isActive,
    userIsActive: e.user.isActive,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Stammdaten"
        title="Mitarbeitende"
        description="Anlegen, bearbeiten und deaktivieren von Mitarbeitenden inklusive Pensum, Standort und Ferienanspruch. Zusätzlich kann das Login-Konto separat gesperrt/entsperrt werden. Alle Änderungen werden im Audit-Log protokolliert."
      />

      <EmployeesTable
        employees={rows}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        defaultLocationId={locations[0]?.id ?? ""}
      />
    </div>
  );
}
