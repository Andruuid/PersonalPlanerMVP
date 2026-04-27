import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.employeeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const employeeId = session.user.employeeId;
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      user: { select: { id: true, email: true, role: true, isActive: true } },
      accountBalances: true,
      bookings: true,
      planEntries: true,
      absenceRequests: true,
      privacyRequests: true,
    },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      roleLabel: employee.roleLabel,
      pensum: employee.pensum,
      entryDate: employee.entryDate,
      exitDate: employee.exitDate,
      locationId: employee.locationId,
      vacationDaysPerYear: employee.vacationDaysPerYear,
      weeklyTargetMinutes: employee.weeklyTargetMinutes,
      hazMinutesPerWeek: employee.hazMinutesPerWeek,
      tztModel: employee.tztModel,
      isActive: employee.isActive,
      user: employee.user,
    },
    balances: employee.accountBalances,
    bookings: employee.bookings,
    planEntries: employee.planEntries,
    absenceRequests: employee.absenceRequests,
    privacyRequests: employee.privacyRequests,
  };

  await writeAudit({
    userId: session.user.id,
    action: "PRIVACY_EXPORT",
    entity: "Employee",
    entityId: employee.id,
    newValue: {
      scope: "self",
      records: {
        balances: employee.accountBalances.length,
        bookings: employee.bookings.length,
        planEntries: employee.planEntries.length,
        absenceRequests: employee.absenceRequests.length,
      },
    },
  });

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="dsgvo-export-${employee.id}.json"`,
    },
  });
}
