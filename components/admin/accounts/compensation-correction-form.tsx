"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpIconTooltip } from "@/components/ui/help-icon-tooltip";
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { correctCompensationAction } from "@/server/bookings";
import type { ActionResult } from "@/server/_shared";
import type { EmployeePickOption } from "./manual-booking-form";
import { formatMinutesAsHours } from "./format";

export interface CompensationCorrectionDefaults {
  employeeId: string;
  date: string;
  /** SONNTAG_FEIERTAG_KOMPENSATION Saldo vor der Korrektur (Jahres-Ansicht). */
  balanceMinutes: number;
}

interface Props {
  employees: EmployeePickOption[];
  defaults: CompensationCorrectionDefaults;
  onSuccess?: () => void;
}

export function CompensationCorrectionForm({
  employees,
  defaults,
  onSuccess,
}: Props) {
  const [errors, setErrors] = useState<{
    message: string;
    fieldErrors: Record<string, string>;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState(defaults.employeeId);

  const balanceLabel = useMemo(
    () => formatMinutesAsHours(defaults.balanceMinutes),
    [defaults.balanceMinutes],
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrors(null);
    startTransition(async () => {
      const result: ActionResult = await correctCompensationAction(
        undefined,
        formData,
      );
      if (result.ok) {
        toast.success("Kompensationskorrektur gebucht.");
        onSuccess?.();
        return;
      }
      setErrors({
        message: result.error,
        fieldErrors: result.fieldErrors ?? {},
      });
    });
  }

  const fieldErr = errors?.fieldErrors ?? {};

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>Korrektur Sonn-/Feiertag</DialogTitle>
        <DialogDescription>
          Korrekturbuchung nur auf diesem Konto; Betrag ohne
          Vorzeichen, Richtung wählen Sie unten. Aktueller Saldo: {balanceLabel}.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="correction-employeeId">Mitarbeitende:r</Label>
          <select
            id="correction-employeeId"
            name="employeeId"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            required
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            <option value="" disabled>
              Mitarbeitende:n wählen...
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          {fieldErr.employeeId ? (
            <p className="text-xs text-rose-600">{fieldErr.employeeId}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="correction-date">Buchungsdatum</Label>
          <Input id="correction-date" name="date" type="date" required defaultValue={defaults.date} />
          {fieldErr.date ? (
            <p className="text-xs text-rose-600">{fieldErr.date}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="correction-minutes" className="inline-flex items-center gap-1">
            Minuten
            <HelpIconTooltip text="Betrag ohne Vorzeichen; die Richtung wählen Sie unten (+/−)." />
          </Label>
          <Input
            id="correction-minutes"
            name="minutes"
            type="number"
            min={1}
            step={1}
            required
            placeholder="z. B. 30"
          />
          {fieldErr.minutes ? (
            <p className="text-xs text-rose-600">{fieldErr.minutes}</p>
          ) : null}
        </div>

        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium text-neutral-900">Vorzeichen</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="correctionSign"
                value="plus"
                defaultChecked
                className="h-4 w-4 border-neutral-300 text-neutral-900"
              />
              <span>Zuschreiben (+)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="correctionSign" value="minus" className="h-4 w-4 border-neutral-300 text-neutral-900" />
              <span>Abschreiben (−)</span>
            </label>
          </div>
          {fieldErr.correctionSign ? (
            <p className="text-xs text-rose-600">{fieldErr.correctionSign}</p>
          ) : null}
        </fieldset>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="correction-comment">Kommentar</Label>
          <textarea
            id="correction-comment"
            name="comment"
            required
            rows={3}
            minLength={3}
            maxLength={300}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            placeholder="Grund für die Korrektur (Audit)"
          />
          {fieldErr.comment ? (
            <p className="text-xs text-rose-600">{fieldErr.comment}</p>
          ) : null}
        </div>
      </div>

      {errors?.message ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {errors.message}
        </p>
      ) : null}

      <DialogFooter className="gap-2 sm:gap-0">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Abbrechen
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Bucht…" : "Korrektur buchen"}
        </Button>
      </DialogFooter>
    </form>
  );
}
