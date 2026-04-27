"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  closeWeekAction,
  publishWeekAction,
  reopenWeekAction,
  resetWeekToDraftAction,
} from "@/server/weeks";
import type { WeekView } from "./types";

interface StatusControlsProps {
  week: WeekView;
}

const STATUS_LABEL: Record<WeekView["status"], string> = {
  DRAFT: "Entwurf",
  PUBLISHED: "Veröffentlicht",
  CLOSED: "Abgeschlossen",
};

const STATUS_PILL: Record<WeekView["status"], string> = {
  DRAFT: "bg-neutral-900 text-white",
  PUBLISHED: "bg-emerald-100 text-emerald-900",
  CLOSED: "bg-neutral-200 text-neutral-700",
};

export function StatusControls({ week }: StatusControlsProps) {
  const [pending, startTransition] = useTransition();

  function notify(result: { ok: boolean; error?: string }, message: string) {
    if (result.ok) toast.success(message);
    else toast.error(result.error ?? "Aktion fehlgeschlagen.");
  }

  function publish() {
    startTransition(async () => {
      notify(await publishWeekAction(week.id), "Woche veröffentlicht.");
    });
  }
  function resetDraft() {
    startTransition(async () => {
      notify(
        await resetWeekToDraftAction(week.id),
        "Woche zurück auf Entwurf.",
      );
    });
  }
  function closeWeek() {
    startTransition(async () => {
      notify(await closeWeekAction(week.id), "Woche abgeschlossen.");
    });
  }
  function reopen() {
    startTransition(async () => {
      notify(await reopenWeekAction(week.id), "Woche wieder geöffnet.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium",
          STATUS_PILL[week.status],
        )}
        variant="secondary"
      >
        {STATUS_LABEL[week.status]}
      </Badge>

      {week.status === "DRAFT" ? (
        <Button onClick={publish} disabled={pending}>
          Woche veröffentlichen
        </Button>
      ) : null}
      {week.status === "PUBLISHED" ? (
        <>
          <Button variant="outline" onClick={resetDraft} disabled={pending}>
            Zurück auf Entwurf
          </Button>
          <Button onClick={closeWeek} disabled={pending}>
            Woche abschliessen
          </Button>
        </>
      ) : null}
      {week.status === "CLOSED" ? (
        <Button variant="outline" onClick={reopen} disabled={pending}>
          Woche wieder öffnen
        </Button>
      ) : null}
    </div>
  );
}
