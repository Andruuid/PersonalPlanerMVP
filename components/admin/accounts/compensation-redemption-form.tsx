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
import { redeemCompensationAction } from "@/server/compensations";
import type { ActionResult } from "@/server/_shared";
import type { EmployeePickOption } from "./manual-booking-form";
import { formatMinutesAsHours } from "./format";

export interface CompensationRedemptionDefaults {
  employeeId: string;
  date: string;
  /** Current SONNTAG_FEIERTAG_KOMPENSATION balance in minutes for the row. */
  availableMinutes: number;
}

interface Props {
  employees: EmployeePickOption[];
  defaults: CompensationRedemptionDefaults;
  onSuccess?: () => void;
}

export function CompensationRedemptionForm({
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

  const availableLabel = useMemo(
    () => formatMinutesAsHours(defaults.availableMinutes),
    [defaults.availableMinutes],
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrors(null);
    startTransition(async () => {
      const result: ActionResult = await redeemCompensationAction(
        undefined,
        formData,
      );
      if (result.ok) {
        toast.success("Bezug gebucht.");
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
        <DialogTitle>Sonn-/Feiertagskompensation einlösen</DialogTitle>
        <DialogDescription>
          Bezug der gewährten Ruhezeit: reduziert das Kompensationskonto um
          die angegebenen Minuten. Ein Kommentar ist Pflicht.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="employeeId">Mitarbeitende:r</Label>
          <select
            id="employeeId"
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
            <p className="text-xs text-rose-700">{fieldErr.employeeId}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <LabelWithHelp
            htmlFor="date"
            label="Datum"
            tooltip="Tag des Bezugs — bestimmt das Saldojahr."
          />
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={defaults.date}
            required
          />
          {fieldErr.date ? (
            <p className="text-xs text-rose-700">{fieldErr.date}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <LabelWithHelp
            htmlFor="minutes"
            label="Minuten"
            tooltip="Bezogene Kompensationszeit in Minuten (z. B. 60 = 1h Ruhezeit)."
          />
          <Input
            id="minutes"
            name="minutes"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            placeholder="z. B. 60"
            required
          />
          {fieldErr.minutes ? (
            <p className="text-xs text-rose-700">{fieldErr.minutes}</p>
          ) : (
            <p className="text-xs text-neutral-500">
              Aktueller Saldo: {availableLabel}
            </p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <LabelWithHelp
            htmlFor="comment"
            label="Kommentar (Pflicht)"
            tooltip="Wird im Audit-Log gespeichert (z. B. Datum/Begründung der gewährten Ruhezeit)."
          />
          <textarea
            id="comment"
            name="comment"
            rows={3}
            required
            className="flex min-h-[68px] w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            placeholder="Grund — bleibt im Audit-Log."
          />
          {fieldErr.comment ? (
            <p className="text-xs text-rose-700">{fieldErr.comment}</p>
          ) : null}
        </div>
      </div>

      {errors?.message ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {errors.message}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Abbrechen
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Buchen..." : "Bezug buchen"}
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
