"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  approveRequestAction,
  rejectRequestAction,
  reopenRequestAction,
} from "@/server/requests";

export type AbsenceRequestType =
  | "VACATION"
  | "FREE_REQUESTED"
  | "UEZ_BEZUG"
  | "TZT"
  | "FREE_DAY";
export type AbsenceRequestStatus =
  | "OPEN"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN"
  | "CANCELLED";

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
  decisionComment: string | null;
  createdAtLabel: string;
  decidedAtLabel: string | null;
  decidedByEmail: string | null;
}

interface AbsencesTableProps {
  rows: AbsenceRequestRow[];
}

const TYPE_LABEL: Record<AbsenceRequestType, string> = {
  VACATION: "Ferienantrag",
  FREE_REQUESTED: "Freier Tag (Zeitsaldo)",
  UEZ_BEZUG: "UEZ-Bezug",
  TZT: "TZT-Antrag",
  FREE_DAY: "Freier Tag (Zeitsaldo)",
};

const STATUS_LABEL: Record<AbsenceRequestStatus, string> = {
  OPEN: "Offen",
  APPROVED: "Genehmigt",
  REJECTED: "Abgelehnt",
  WITHDRAWN: "Zurückgezogen",
  CANCELLED: "Storniert",
};

const STATUS_BADGE: Record<AbsenceRequestStatus, string> = {
  OPEN: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  WITHDRAWN: "bg-neutral-200 text-neutral-700",
  CANCELLED: "bg-neutral-200 text-neutral-700",
};

const REASON_MAX = 300;

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
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function approve() {
    startTransition(async () => {
      const r = await approveRequestAction(row.id);
      if (r.ok) toast.success("Antrag genehmigt.");
      else toast.error(r.error);
    });
  }

  function confirmReject() {
    startTransition(async () => {
      const r = await rejectRequestAction(row.id, rejectReason || undefined);
      if (r.ok) {
        toast.success("Antrag abgelehnt.");
        setRejectOpen(false);
        setRejectReason("");
      } else toast.error(r.error);
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
        {row.status === "REJECTED" && row.decisionComment ? (
          <div className="mt-2 max-w-xs rounded-md border border-neutral-100 bg-neutral-50 px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Begründung GL
            </p>
            <p className="mt-0.5 text-xs text-neutral-700">{row.decisionComment}</p>
          </div>
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
        {row.status === "OPEN" ? (
          <>
            <div className="flex justify-end gap-2">
              <Button size="sm" disabled={pending} onClick={approve}>
                Genehmigen
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setRejectOpen(true)}
              >
                Ablehnen
              </Button>
            </div>
            <Dialog
              open={rejectOpen}
              onOpenChange={(open) => {
                setRejectOpen(open);
                if (!open) setRejectReason("");
              }}
            >
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Antrag ablehnen</DialogTitle>
                  <DialogDescription>
                    Optional: Begründung für die Mitarbeitenden-Ansicht (max.{" "}
                    {REASON_MAX} Zeichen).
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                  <Label htmlFor={`reject-${row.id}`}>Begründung</Label>
                  <textarea
                    id={`reject-${row.id}`}
                    value={rejectReason}
                    onChange={(e) =>
                      setRejectReason(e.target.value.slice(0, REASON_MAX))
                    }
                    rows={4}
                    maxLength={REASON_MAX}
                    placeholder="z. B. Personaldecke in dieser Woche…"
                    className="min-h-[96px] w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                  />
                  <p className="text-right text-xs text-neutral-400">
                    {rejectReason.length}/{REASON_MAX}
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => setRejectOpen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={confirmReject}
                  >
                    Ablehnen
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : row.status === "APPROVED" || row.status === "REJECTED" ? (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={reopen}
            >
              Wieder eröffnen
            </Button>
          </div>
        ) : (
          <div className="flex justify-end text-xs text-neutral-400">—</div>
        )}
      </td>
    </tr>
  );
}
