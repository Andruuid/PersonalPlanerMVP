"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTransition } from "react";
import { toast } from "sonner";
import { withdrawShiftWishAction } from "@/server/shift-wishes";
import {
  REQUEST_STATUS_BADGE,
  REQUEST_STATUS_LABELS,
  type MyShiftWishView,
} from "./types";

interface ShiftWishStatusListProps {
  wishes: MyShiftWishView[];
  emptyHint?: string;
}

export function ShiftWishStatusList({
  wishes,
  emptyHint = "Keine Schicht-Wünsche.",
}: ShiftWishStatusListProps) {
  if (wishes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-200 bg-white px-4 py-6 text-center text-sm text-neutral-500">
        {emptyHint}
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {wishes.map((w) => (
        <WishRow key={w.id} wish={w} />
      ))}
    </ul>
  );
}

function WishRow({ wish }: { wish: MyShiftWishView }) {
  const [pending, startTransition] = useTransition();

  function withdraw() {
    startTransition(async () => {
      const result = await withdrawShiftWishAction(wish.id);
      if (result.ok) toast.success("Schicht-Wunsch zurückgezogen.");
      else toast.error(result.error);
    });
  }

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">Schicht-Wunsch</p>
          <p className="text-xs text-neutral-500">
            {wish.dateLabel} · {wish.summaryLabel}
          </p>
        </div>
        <Badge
          className={cn(REQUEST_STATUS_BADGE[wish.status], "shrink-0")}
          variant="secondary"
        >
          {REQUEST_STATUS_LABELS[wish.status]}
        </Badge>
      </div>

      {wish.comment ? (
        <p className="mt-2 text-xs text-neutral-600">
          <span className="font-medium text-neutral-700">Dein Kommentar:</span>{" "}
          {wish.comment}
        </p>
      ) : null}

      {wish.status === "REJECTED" && wish.decisionComment ? (
        <p className="mt-2 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-900">
          <span className="font-medium">Begründung:</span> {wish.decisionComment}
        </p>
      ) : null}

      {wish.status === "OPEN" ? (
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={withdraw}
            className="text-rose-700 hover:bg-rose-50"
          >
            Zurückziehen
          </Button>
        </div>
      ) : null}
    </li>
  );
}
