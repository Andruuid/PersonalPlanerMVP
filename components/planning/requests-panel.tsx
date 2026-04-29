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
} from "@/server/requests";
import type { RequestView } from "./types";

interface RequestsPanelProps {
  requests: RequestView[];
}

const REASON_MAX = 300;

const TYPE_TITLES: Record<RequestView["type"], string> = {
  VACATION: "Ferienantrag",
  FREE_REQUESTED: "Freiwunsch",
  UEZ_BEZUG: "UEZ-Bezug",
  TZT: "TZT-Antrag",
  FREE_DAY: "Freier Tag",
  PARENTAL_CARE: "Eltern-/Betreuungsurlaub",
};

const STATUS_BADGE: Record<RequestView["status"], string> = {
  OPEN: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
};

const STATUS_LABEL: Record<RequestView["status"], string> = {
  OPEN: "Offen",
  APPROVED: "Genehmigt",
  REJECTED: "Abgelehnt",
};

export function RequestsPanel({ requests }: RequestsPanelProps) {
  const openCount = requests.filter((r) => r.status === "OPEN").length;
  const sorted = [...requests].sort((a, b) => {
    if (a.status === "OPEN" && b.status !== "OPEN") return -1;
    if (a.status !== "OPEN" && b.status === "OPEN") return 1;
    return a.startDate.localeCompare(b.startDate);
  });

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="app-label-caps text-sm font-semibold text-neutral-700">
          Offene Anträge
        </h2>
        <span className="text-xs text-neutral-500">{openCount}</span>
      </header>

      {sorted.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Aktuell sind keine Anträge eingegangen.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((r) => (
            <RequestItem key={r.id} request={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestItem({ request }: { request: RequestView }) {
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  function approve() {
    startTransition(async () => {
      const result = await approveRequestAction(request.id);
      if (result.ok) toast.success("Antrag genehmigt.");
      else toast.error(result.error);
    });
  }

  function confirmReject() {
    startTransition(async () => {
      const result = await rejectRequestAction(request.id, rejectReason || undefined);
      if (result.ok) {
        toast.success("Antrag abgelehnt.");
        setRejectOpen(false);
        setRejectReason("");
      } else toast.error(result.error);
    });
  }

  return (
    <li className="rounded-xl border border-neutral-200 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-neutral-900">
            {TYPE_TITLES[request.type]}
          </p>
          <p className="text-xs text-neutral-500">
            {request.employeeName} · {request.rangeLabel}
          </p>
        </div>
        <Badge
          className={cn(STATUS_BADGE[request.status], "shrink-0")}
          variant="secondary"
        >
          {STATUS_LABEL[request.status]}
        </Badge>
      </div>

      {request.comment ? (
        <p className="mb-2 line-clamp-2 text-xs text-neutral-600">
          {request.comment}
        </p>
      ) : null}

      {request.status === "OPEN" ? (
        <>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={pending}
              onClick={approve}
            >
              Genehmigen
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
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
                <Label htmlFor={`reject-plan-${request.id}`}>Begründung</Label>
                <textarea
                  id={`reject-plan-${request.id}`}
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
      ) : null}
    </li>
  );
}
