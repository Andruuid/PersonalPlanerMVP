"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface RequestDialogProps {
  open: boolean;
  type: RequestType | null;
  onOpenChange: (open: boolean) => void;
}

const DESCRIPTIONS: Record<RequestType, string> = {
  VACATION:
    "Ferienantrag — wird an die Geschäftsleitung übermittelt und nach Genehmigung im Ferienkonto verbucht.",
  FREE_REQUESTED:
    "Frei verlangt — der Tag wird vom Zeitsaldo abgezogen, sobald die Bitte bestätigt ist.",
  TZT: "TZT erfassen — geplante TZT-Tage zur Genehmigung beantragen.",
  FREE_DAY:
    "Freier Tag — unbezahlt freier Tag, sofern keine Sollzeit besteht.",
};

export function RequestDialog({ open, type, onOpenChange }: RequestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
  return new Date().toISOString().slice(0, 10);
}

function RequestForm({ type, onClose }: RequestFormProps) {
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [endDate, setEndDate] = useState<string>(todayIso());
  const [comment, setComment] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Von</Label>
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
          <Label htmlFor="endDate">Bis</Label>
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
        <Label htmlFor="comment">Kommentar (optional)</Label>
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
