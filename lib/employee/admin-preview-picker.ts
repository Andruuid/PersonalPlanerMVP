import "server-only";

import { prisma } from "@/lib/db";

export type AdminPreviewPickerEmployee = {
  id: string;
  firstName: string;
  lastName: string;
  roleLabel: string | null;
};

export async function loadEmployeesForPreviewPicker(
  tenantId: string,
): Promise<AdminPreviewPickerEmployee[]> {
  return prisma.employee.findMany({
    where: { tenantId, isActive: true, deletedAt: null },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, roleLabel: true },
  });
}

export function previewEmployeeLabel(e: AdminPreviewPickerEmployee): string {
  return `${e.firstName} ${e.lastName}${e.roleLabel ? ` · ${e.roleLabel}` : ""}`;
}
