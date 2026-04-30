import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { AuditLog } from "@/lib/generated/prisma/client";

function parseAuditStored(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/** Redacts old/new payloads when the row refers to another employee record (DSGVO export). */
function sanitizeAuditPayloadsForExport(
  row: Pick<AuditLog, "entity" | "entityId" | "oldValue" | "newValue">,
  selfEmployeeId: string,
): { oldValue: unknown; newValue: unknown } {
  const aboutOtherEmployee =
    row.entity === "Employee" &&
    row.entityId != null &&
    row.entityId !== selfEmployeeId;

  if (aboutOtherEmployee) {
    return { oldValue: null, newValue: null };
  }
  return {
    oldValue: parseAuditStored(row.oldValue),
    newValue: parseAuditStored(row.newValue),
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.employeeId || !session.user.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const employeeId = session.user.employeeId;
  const tenantId = session.user.tenantId;
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, tenantId, deletedAt: null },
    include: {
      user: { select: { id: true, email: true, role: true, isActive: true } },
      accountBalances: { where: { tenantId } },
      bookings: { where: { tenantId } },
      planEntries: {
        where: {
          deletedAt: null,
          week: { tenantId, deletedAt: null },
        },
      },
      absenceRequests: { where: { tenantId } },
      privacyRequests: { where: { tenantId } },
    },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const auditRows = await prisma.auditLog.findMany({
    where: {
      tenantId,
      OR: [
        { userId: session.user.id },
        { entity: "Employee", entityId: employee.id },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  const auditLog = auditRows.map((row) => {
    const { oldValue, newValue } = sanitizeAuditPayloadsForExport(
      row,
      employee.id,
    );
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      userId: row.userId,
      comment: row.comment,
      oldValue,
      newValue,
    };
  });

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
    auditLog,
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
        auditLog: auditLog.length,
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
