"use client";

import { useLayoutEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpIconTooltip } from "@/components/ui/help-icon-tooltip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createAbsenceRequestAction } from "@/server/requests";
import type { ActionResult } from "@/server/_shared";
import { REQUEST_TYPE_LABELS, type RequestType } from "./types";
import { isoDateString } from "@/lib/time/week";

interface RequestDialogProps {
  open: boolean;
  type: RequestType | null;
  onOpenChange: (open: boolean) => void;
}

const DESCRIPTIONS: Record<RequestType, string> = {
  VACATION:
    "Ferienantrag — wird an die Geschäftsleitung übermittelt und nach Genehmigung im Ferienkonto verbucht.",
  FREE_REQUESTED:
    "Freier Tag zu Lasten des Zeitsaldos — Antrag nur möglich bei genügend Zeitsaldo. Bei Genehmigung wird der Tagessoll vom Zeitsaldo abgezogen.",
  UEZ_BEZUG:
    "Antrag, einen geplanten Arbeitstag durch UEZ zu kompensieren — verfügbar nur bei genügend UEZ-Saldo.",
  TZT: "TZT erfassen — geplante TZT-Tage zur Genehmigung beantragen.",
  FREE_DAY:
    "Freier Tag zu Lasten des Zeitsaldos — nur bei genügend Zeitsaldo möglich; bei Genehmigung wird der Tagessoll vom Zeitsaldo abgezogen.",
  PARENTAL_CARE:
    "Eltern-/Betreuungsurlaub — wird bei Genehmigung aus dem gleichnamigen Kontingentkonto bezogen.",
};

const ENTITLEMENT_HINTS: Record<RequestType, string | null> = {
  VACATION:
    "Antrag nur möglich mit genügend Ferienguthaben im betroffenen Jahr.",
  FREE_REQUESTED:
    "Antrag nur möglich mit genügend Zeitsaldo im betroffenen Jahr. Bei Genehmigung wird der Wert vom Zeitsaldo abgezogen.",
  UEZ_BEZUG:
    "Antrag nur möglich mit genügend UEZ-Minuten im betroffenen Jahr. Bei Genehmigung wird der Bezug mit der Wochenschliessung vom UEZ-Konto abgezogen (Zeitsaldo bleibt neutral).",
  TZT: "Antrag nur möglich mit genügend TZT-Guthaben.",
  FREE_DAY:
    "Antrag nur möglich mit genügend Zeitsaldo im betroffenen Jahr. Bei Genehmigung wird der Wert vom Zeitsaldo abgezogen.",
  PARENTAL_CARE:
    "Antrag nur möglich mit genügend Guthaben im Eltern-/Betreuungsurlaub-Konto.",
};

export function RequestDialog({ open, type, onOpenChange }: RequestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => {
          // Radix fokussiert sonst das erste tabbare Element — oft das Hilfe-(i)-Icon,
          // wodurch der Tooltip mit delay 0 sofort aufgeht.
          e.preventDefault();
        }}
      >
        {open && type ? (
          <RequestForm
            key={type}
            type={type}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface RequestFormProps {
  type: RequestType;
  onClose: () => void;
}

function todayIso(): string {
  return isoDateString(new Date());
}

function RequestForm({ type, onClose }: RequestFormProps) {
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [comment, setComment] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const entitlementHint = ENTITLEMENT_HINTS[type];

  useLayoutEffect(() => {
    document.getElementById("startDate")?.focus({ preventScroll: true });
  }, [type]);

  function handleStartChange(value: string) {
    setStartDate(value);
    if (value > endDate) setEndDate(value);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setGlobalError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("type", type);
    startTransition(async () => {
      const result: ActionResult = await createAbsenceRequestAction(
        undefined,
        formData,
      );
      if (result.ok) {
        toast.success("Antrag eingereicht.");
        onClose();
        return;
      }
      setGlobalError(result.error);
      setErrors(result.fieldErrors ?? {});
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{REQUEST_TYPE_LABELS[type]}</DialogTitle>
        <DialogDescription>{DESCRIPTIONS[type]}</DialogDescription>
        {entitlementHint ? (
          <div className="pt-1 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-1.5">
              <span>Hinweis zur Anspruchspruefung</span>
              <HelpIconTooltip text={entitlementHint} />
            </span>
          </div>
        ) : null}
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <LabelWithHelp
            htmlFor="startDate"
            label="Von"
            tooltip="Startdatum des beantragten Zeitraums."
          />
          <Input
            id="startDate"
            name="startDate"
            type="date"
            value={startDate}
            onChange={(e) => handleStartChange(e.target.value)}
            required
          />
          {errors.startDate ? (
            <p className="text-xs text-rose-700">{errors.startDate}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <LabelWithHelp
            htmlFor="endDate"
            label="Bis"
            tooltip="Enddatum des beantragten Zeitraums (inklusive)."
          />
          <Input
            id="endDate"
            name="endDate"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
          {errors.endDate ? (
            <p className="text-xs text-rose-700">{errors.endDate}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <LabelWithHelp
          htmlFor="comment"
          label="Kommentar (optional)"
          tooltip="Hilft bei der Entscheidung und erscheint in der Antragshistorie."
        />
        <textarea
          id="comment"
          name="comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
          className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          placeholder="z. B. Familienferien"
        />
        {errors.comment ? (
          <p className="text-xs text-rose-700">{errors.comment}</p>
        ) : null}
      </div>

      {globalError ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {globalError}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pending}>
            Abbrechen
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Senden..." : "Antrag senden"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LabelWithHelp({
  htmlFor,
  label,
  tooltip,
}: {
  htmlFor: string;
  label: string;
  tooltip: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      <HelpIconTooltip text={tooltip} />
    </div>
  );
}
