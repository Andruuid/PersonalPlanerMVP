import { format } from "date-fns";
import { prisma } from "@/lib/db";
import {
  listAuditLogs,
  loadAuditFacets,
  type AuditFilter,
} from "@/lib/audit";
import { PageHeader } from "@/components/admin/page-header";
import { AuditFilter as AuditFilterBar } from "@/components/admin/audit/audit-filter";
import {
  AuditTable,
  type AuditTableRow,
} from "@/components/admin/audit/audit-table";
import { AuditPagination } from "@/components/admin/audit/audit-pagination";
import { requireAdmin } from "@/server/_shared";

export const metadata = { title: "Audit-Log · PersonalPlaner" };

interface PageProps {
  searchParams: Promise<{
    user?: string;
    entity?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 25;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pickIso(raw: string | undefined): string {
  return raw && ISO_DATE_RE.test(raw) ? raw : "";
}

function pickPage(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export default async function AuditPage({ searchParams }: PageProps) {
  const admin = await requireAdmin();
  const raw = await searchParams;

  const filter: AuditFilter = {
    tenantId: admin.tenantId,
    userId: raw.user && raw.user !== "ALL" ? raw.user : undefined,
    entity: raw.entity && raw.entity !== "ALL" ? raw.entity : undefined,
    action: raw.action && raw.action !== "ALL" ? raw.action : undefined,
    fromIso: pickIso(raw.from) || undefined,
    toIso: pickIso(raw.to) || undefined,
  };

  const page = pickPage(raw.page);

  const [facets, list] = await Promise.all([
    loadAuditFacets(prisma, admin.tenantId),
    listAuditLogs(prisma, filter, { page, pageSize: PAGE_SIZE }),
  ]);

  const rows: AuditTableRow[] = list.rows.map((r) => ({
    id: r.id,
    userEmail: r.userEmail,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    oldValue: r.oldValue,
    newValue: r.newValue,
    comment: r.comment,
    createdAtLabel: format(r.createdAt, "dd.MM.yyyy HH:mm"),
  }));

  const baseQueryParams = new URLSearchParams();
  if (filter.userId) baseQueryParams.set("user", filter.userId);
  if (filter.entity) baseQueryParams.set("entity", filter.entity);
  if (filter.action) baseQueryParams.set("action", filter.action);
  if (filter.fromIso) baseQueryParams.set("from", filter.fromIso);
  if (filter.toIso) baseQueryParams.set("to", filter.toIso);
  const baseQuery = baseQueryParams.toString();

  return (
    <div className="space-y-6">
      <PageHeader
        caption="Sicherheit"
        title="Audit-Log"
        description="Vollständige Historie aller Änderungen — gefiltert nach Benutzer:in, Entität, Aktion oder Datum. Klicke einen Eintrag an, um den Vorher/Nachher-Diff zu sehen."
      />

      <AuditFilterBar
        userId={filter.userId ?? "ALL"}
        entity={filter.entity ?? "ALL"}
        action={filter.action ?? "ALL"}
        fromIso={filter.fromIso ?? ""}
        toIso={filter.toIso ?? ""}
        facets={facets}
      />

      <AuditTable rows={rows} />

      <AuditPagination
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        pageSize={list.pageSize}
        baseQuery={baseQuery}
      />
    </div>
  );
}
