"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  approveRequestAction,
  rejectRequestAction,
  reopenRequestAction,
} from "@/server/requests";

export type AbsenceRequestType =
  | "VACATION"
  | "FREE_REQUESTED"
  | "TZT"
  | "FREE_DAY";
export type AbsenceRequestStatus = "OPEN" | "APPROVED" | "REJECTED";

export interface AbsenceRequestRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRoleLabel: string | null;
  type: AbsenceRequestType;
  status: AbsenceRequestStatus;
  startIso: string;
  endIso: string;
  rangeLabel: string;
  comment: string | null;
  createdAtLabel: string;
  decidedAtLabel: string | null;
  decidedByEmail: string | null;
}

interface AbsencesTableProps {
  rows: AbsenceRequestRow[];
}

const TYPE_LABEL: Record<AbsenceRequestType, string> = {
  VACATION: "Ferienantrag",
  FREE_REQUESTED: "Frei verlangt",
  TZT: "TZT-Antrag",
  FREE_DAY: "Freier Tag",
};

const STATUS_LABEL: Record<AbsenceRequestStatus, string> = {
  OPEN: "Offen",
  APPROVED: "Genehmigt",
  REJECTED: "Abgelehnt",
};

const STATUS_BADGE: Record<AbsenceRequestStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
};

export function AbsencesTable({ rows }: AbsencesTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-neutral-900">
          Keine Anträge im aktuellen Filter.
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Filter zurücksetzen, um alle Anträge zu sehen.
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
              <th className="px-4 py-3">Mitarbeitende:r</th>
              <th className="px-4 py-3">Antrag</th>
              <th className="px-4 py-3">Zeitraum</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Eingereicht</th>
              <th className="px-4 py-3 text-right">Aktionen</th>
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

function Row({ row }: { row: AbsenceRequestRow }) {
  const [pending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const r = await approveRequestAction(row.id);
      if (r.ok) toast.success("Antrag genehmigt.");
      else toast.error(r.error);
    });
  }
  function reject() {
    startTransition(async () => {
      const r = await rejectRequestAction(row.id);
      if (r.ok) toast.success("Antrag abgelehnt.");
      else toast.error(r.error);
    });
  }
  function reopen() {
    startTransition(async () => {
      const r = await reopenRequestAction(row.id);
      if (r.ok) toast.success("Antrag wieder eröffnet.");
      else toast.error(r.error);
    });
  }

  return (
    <tr className="align-top hover:bg-neutral-50/60">
      <td className="px-4 py-3">
        <div className="font-medium text-neutral-900">{row.employeeName}</div>
        {row.employeeRoleLabel ? (
          <div className="text-xs text-neutral-500">
            {row.employeeRoleLabel}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <div className="font-medium text-neutral-900">
          {TYPE_LABEL[row.type]}
        </div>
        {row.comment ? (
          <p className="mt-1 line-clamp-2 max-w-xs text-xs text-neutral-600">
            {row.comment}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-neutral-700">{row.rangeLabel}</td>
      <td className="px-4 py-3">
        <Badge
          className={cn(STATUS_BADGE[row.status], "shrink-0")}
          variant="secondary"
        >
          {STATUS_LABEL[row.status]}
        </Badge>
        {row.status !== "OPEN" && row.decidedAtLabel ? (
          <p className="mt-1 text-xs text-neutral-500">
            {row.decidedAtLabel}
            {row.decidedByEmail ? ` · ${row.decidedByEmail}` : ""}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-xs text-neutral-500">
        {row.createdAtLabel}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          {row.status === "OPEN" ? (
            <>
              <Button size="sm" disabled={pending} onClick={approve}>
                Genehmigen
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={reject}
              >
                Ablehnen
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={reopen}
            >
              Wieder eröffnen
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
