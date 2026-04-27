"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  approveRequestAction,
  rejectRequestAction,
} from "@/server/requests";
import type { RequestView } from "./types";

interface RequestsPanelProps {
  requests: RequestView[];
}

const TYPE_TITLES: Record<RequestView["type"], string> = {
  VACATION: "Ferienantrag",
  FREE_REQUESTED: "Freiwunsch",
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

  function approve() {
    startTransition(async () => {
      const result = await approveRequestAction(request.id);
      if (result.ok) toast.success("Antrag genehmigt.");
      else toast.error(result.error);
    });
  }
  function reject() {
    startTransition(async () => {
      const result = await rejectRequestAction(request.id);
      if (result.ok) toast.success("Antrag abgelehnt.");
      else toast.error(result.error);
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
            onClick={reject}
          >
            Ablehnen
          </Button>
        </div>
      ) : null}
    </li>
  );
}
