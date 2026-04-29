import { prisma } from "@/lib/db";
import { requireAdmin } from "@/server/_shared";
import { PageHeader } from "@/components/admin/page-header";
import {
  ServicesTable,
  type ServiceRow,
} from "@/components/admin/services/services-table";

export const metadata = { title: "Dienste · PersonalPlaner" };

export default async function ServicesPage() {
  const admin = await requireAdmin();
  const services = await prisma.serviceTemplate.findMany({
    where: { tenantId: admin.tenantId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const rows: ServiceRow[] = services.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    startTime: s.startTime,
    endTime: s.endTime,
    breakMinutes: s.breakMinutes,
    comment: s.comment,
    defaultDays: s.defaultDays,
    requiredCount: s.requiredCount,
    isActive: s.isActive,
    blockColorHex: s.blockColorHex,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Stammdaten"
        title="Dienste"
        description="Dienstvorlagen pflegen — Frühdienst, Spätdienst, Samstagsdienst und mehr. Vorlagen werden in der Wochenplanung als Drag-Blöcke angezeigt."
      />

      <ServicesTable services={rows} />
    </div>
  );
}
