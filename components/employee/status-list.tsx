"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { cancelOwnRequestAction } from "@/server/requests";
import {
  REQUEST_STATUS_BADGE,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  type MyRequestView,
} from "./types";

interface StatusListProps {
  requests: MyRequestView[];
  emptyHint?: string;
  showCancel?: boolean;
}

export function StatusList({
  requests,
  emptyHint = "Du hast bisher keine Anträge gestellt.",
  showCancel = true,
}: StatusListProps) {
  if (requests.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
        {emptyHint}
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {requests.map((r) => (
        <RequestRow key={r.id} request={r} showCancel={showCancel} />
      ))}
    </ul>
  );
}

function RequestRow({
  request,
  showCancel,
}: {
  request: MyRequestView;
  showCancel: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const result = await cancelOwnRequestAction(request.id);
      if (result.ok) {
        toast.success("Antrag zurückgezogen.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">
            {REQUEST_TYPE_LABELS[request.type]}
          </p>
          <p className="text-xs text-neutral-500">{request.rangeLabel}</p>
        </div>
        <Badge
          className={cn(REQUEST_STATUS_BADGE[request.status], "shrink-0")}
          variant="secondary"
        >
          {REQUEST_STATUS_LABELS[request.status]}
        </Badge>
      </div>

      {request.comment ? (
        <p className="mt-2 line-clamp-2 text-xs text-neutral-600">
          {request.comment}
        </p>
      ) : null}

      {showCancel && request.status === "OPEN" ? (
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={cancel}
            className="text-rose-700 hover:bg-rose-50"
          >
            Zurückziehen
          </Button>
        </div>
      ) : null}
    </li>
  );
}
