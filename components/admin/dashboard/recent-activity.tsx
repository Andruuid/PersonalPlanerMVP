import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import type { AuditRow } from "@/lib/audit";

interface RecentActivityProps {
  rows: AuditRow[];
}

export function RecentActivity({ rows }: RecentActivityProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
        Noch keine Aktivität.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <ul className="divide-y divide-neutral-100">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
          >
            <span className="truncate text-neutral-700">{row.userEmail}</span>
            <Badge
              variant="secondary"
              className="shrink-0 bg-neutral-100 text-neutral-700"
            >
              {row.action}
            </Badge>
            <span className="text-neutral-700">{row.entity}</span>
            <span className="ml-auto whitespace-nowrap text-xs text-neutral-500">
              {formatDistanceToNow(row.createdAt, {
                addSuffix: true,
                locale: de,
              })}
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-neutral-100 bg-neutral-50/50 px-4 py-2 text-right">
        <Link
          href="/audit"
          className="text-xs font-medium text-neutral-700 hover:text-neutral-900"
        >
          Alle Audit-Einträge →
        </Link>
      </div>
    </div>
  );
}
