"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [cascadeRecalc, setCascadeRecalc] = useState(true);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideSummary, setOverrideSummary] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideFieldError, setOverrideFieldError] = useState<string | null>(
    null,
  );

  function notify(result: { ok: boolean; error?: string }, message: string) {
    if (result.ok) toast.success(message);
    else toast.error(result.error ?? "Aktion fehlgeschlagen.");
  }

  function openPublishConfirm() {
    setPublishConfirmOpen(true);
  }

  function runPublish(reason?: string) {
    startTransition(async () => {
      const result = await publishWeekAction(
        week.id,
        reason === undefined ? undefined : reason,
      );
      if (result.ok) {
        toast.success("Woche veröffentlicht.");
        setPublishConfirmOpen(false);
        setOverrideDialogOpen(false);
        setOverrideSummary(null);
        setOverrideReason("");
        setOverrideFieldError(null);
        return;
      }
      if (result.fieldErrors?.override) {
        setOverrideSummary(result.error ?? null);
        setOverrideFieldError(
          reason === undefined ? null : result.fieldErrors.override,
        );
        setPublishConfirmOpen(false);
        setOverrideDialogOpen(true);
        return;
      }
      toast.error(result.error ?? "Aktion fehlgeschlagen.");
      setPublishConfirmOpen(false);
    });
  }

  function confirmPublish() {
    runPublish(undefined);
  }

  function submitOverridePublish() {
    setOverrideFieldError(null);
    runPublish(overrideReason);
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
  function confirmReopen() {
    startTransition(async () => {
      notify(
        await reopenWeekAction(week.id, cascadeRecalc),
        "Woche wieder geöffnet.",
      );
      setReopenDialogOpen(false);
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
        <Button onClick={openPublishConfirm} disabled={pending}>
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
        <Button
          variant="outline"
          onClick={() => setReopenDialogOpen(true)}
          disabled={pending}
        >
          Woche wieder öffnen
        </Button>
      ) : null}

      <Dialog
        open={publishConfirmOpen}
        onOpenChange={(open) => {
          setPublishConfirmOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Woche veröffentlichen?</DialogTitle>
            <DialogDescription>
              Der aktuelle Plan wird für Mitarbeitende sichtbar. Pflichtprüfungen
              (Ruhezeit, Arbeitstage in Folge, freier Halbtag) blockieren die
              Veröffentlichung ohne gültige Begründung.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setPublishConfirmOpen(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button onClick={confirmPublish} disabled={pending}>
              Veröffentlichen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={overrideDialogOpen}
        onOpenChange={(open) => {
          setOverrideDialogOpen(open);
          if (!open) {
            setOverrideSummary(null);
            setOverrideReason("");
            setOverrideFieldError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Pflicht-Verstöße — mit Begründung publizieren</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap text-left text-foreground">
              {overrideSummary}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="publish-override-reason">Begründung</Label>
            <textarea
              id="publish-override-reason"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              disabled={pending}
              rows={4}
              className={cn(
                "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
                overrideFieldError &&
                  "border-destructive ring-3 ring-destructive/20",
              )}
              aria-invalid={!!overrideFieldError}
              placeholder="Mind. 10 Zeichen …"
            />
            {overrideFieldError ? (
              <p className="text-sm text-destructive">{overrideFieldError}</p>
            ) : null}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setOverrideDialogOpen(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button onClick={submitOverridePublish} disabled={pending}>
              Mit Begründung veröffentlichen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reopenDialogOpen}
        onOpenChange={(open) => {
          setReopenDialogOpen(open);
          if (open) setCascadeRecalc(true);
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Woche wieder öffnen?</DialogTitle>
            <DialogDescription>
              Die Abschluss-Buchungen dieser Woche werden entfernt. Die Woche
              ist danach wieder ein Entwurf und kann bearbeitet werden.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-lg border p-3">
            <input
              id="reopen-cascade"
              type="checkbox"
              checked={cascadeRecalc}
              disabled={pending}
              onChange={(e) => setCascadeRecalc(e.target.checked)}
              className="mt-0.5 size-4 rounded border-input accent-primary"
            />
            <Label htmlFor="reopen-cascade" className="font-normal leading-snug">
              Auch die folgenden abgeschlossenen Wochen neu berechnen (empfohlen)
            </Label>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setReopenDialogOpen(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button onClick={confirmReopen} disabled={pending}>
              Wieder öffnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
