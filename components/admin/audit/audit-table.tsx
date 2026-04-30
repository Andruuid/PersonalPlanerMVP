"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AuditDiff } from "./audit-diff";

export interface AuditTableRow {
  id: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  comment: string | null;
  createdAtLabel: string;
}

interface AuditTableProps {
  rows: AuditTableRow[];
}

const ACTION_BADGE: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-800",
  UPDATE: "bg-sky-100 text-sky-800",
  DELETE: "bg-rose-100 text-rose-800",
  PUBLISH: "bg-indigo-100 text-indigo-800",
  RESET_TO_DRAFT: "bg-amber-100 text-amber-800",
  CLOSE: "bg-violet-100 text-violet-800",
  REOPEN: "bg-sky-100 text-sky-800",
  APPROVE: "bg-emerald-100 text-emerald-800",
  REJECT: "bg-rose-100 text-rose-800",
  CANCEL: "bg-neutral-200 text-neutral-700",
  ACTIVATE: "bg-emerald-100 text-emerald-800",
  DEACTIVATE: "bg-rose-100 text-rose-800",
  MANUAL_BOOKING: "bg-sky-100 text-sky-800",
  COMPENSATION_CORRECTION: "bg-teal-100 text-teal-900",
  PARENTAL_CARE_GRANT: "bg-teal-100 text-teal-800",
  RECALC_WEEK: "bg-violet-100 text-violet-800",
  REVERT_RECALC_WEEK: "bg-amber-100 text-amber-800",
  YEAR_END_CARRYOVER: "bg-violet-100 text-violet-800",
  YEAR_END_CARRYOVER_AUTO: "bg-violet-100 text-violet-800",
  GENERATE: "bg-teal-100 text-teal-800",
  MOVE: "bg-sky-100 text-sky-800",
};

function actionClass(action: string): string {
  return ACTION_BADGE[action] ?? "bg-neutral-200 text-neutral-700";
}

export function AuditTable({ rows }: AuditTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-neutral-900">
          Keine Audit-Einträge im aktuellen Filter.
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Filter zurücksetzen, um die volle Historie zu sehen.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="w-10 px-2 py-3" aria-label="Details ausklappen" />
              <th className="px-4 py-3">Zeitpunkt</th>
              <th className="px-4 py-3">Benutzer:in</th>
              <th className="px-4 py-3">Aktion</th>
              <th className="px-4 py-3">Entität</th>
              <th className="px-4 py-3">Kommentar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ row }: { row: AuditTableRow }) {
  const [open, setOpen] = useState(false);
  const hasDetails =
    row.oldValue !== null || row.newValue !== null || row.entityId !== null;

  return (
    <>
      <tr
        className={cn(
          "align-top",
          hasDetails
            ? "cursor-pointer hover:bg-neutral-50/60"
            : "hover:bg-neutral-50/40",
        )}
        onClick={() => hasDetails && setOpen((v) => !v)}
      >
        <td className="px-2 py-3 align-middle">
          {hasDetails ? (
            open ? (
              <ChevronDown className="h-4 w-4 text-neutral-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-neutral-500" />
            )
          ) : null}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">
          {row.createdAtLabel}
        </td>
        <td className="px-4 py-3 text-neutral-700">{row.userEmail}</td>
        <td className="px-4 py-3">
          <Badge
            className={cn(actionClass(row.action), "shrink-0")}
            variant="secondary"
          >
            {row.action}
          </Badge>
        </td>
        <td className="px-4 py-3">
          <div className="font-medium text-neutral-900">{row.entity}</div>
          {row.entityId ? (
            <div className="font-mono text-[11px] text-neutral-500">
              {row.entityId}
            </div>
          ) : null}
        </td>
        <td className="px-4 py-3 text-neutral-700">
          {row.comment ? (
            <span className="line-clamp-2 max-w-md text-xs">
              {row.comment}
            </span>
          ) : (
            <span className="text-xs text-neutral-400">—</span>
          )}
        </td>
      </tr>
      {open && hasDetails ? (
        <tr className="bg-neutral-50/60">
          <td />
          <td colSpan={5} className="px-4 py-4">
            <AuditDiff oldValue={row.oldValue} newValue={row.newValue} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
