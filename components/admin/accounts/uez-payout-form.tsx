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
import { payoutUezAction } from "@/server/bookings";
import type { ActionResult } from "@/server/_shared";
import type { UezPayoutPolicy } from "@/lib/bookings/core";
import type { EmployeePickOption } from "./manual-booking-form";
import { formatMinutesAsHours } from "./format";

export interface UezPayoutDefaults {
  employeeId: string;
  date: string;
  /** Current UEZ balance in minutes for the row. */
  availableMinutes: number;
}

interface Props {
  employees: EmployeePickOption[];
  defaults: UezPayoutDefaults;
  uezPayoutPolicy: UezPayoutPolicy;
  onSuccess?: () => void;
}

export function UezPayoutForm({
  employees,
  defaults,
  uezPayoutPolicy,
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
      const result: ActionResult = await payoutUezAction(undefined, formData);
      if (result.ok) {
        toast.success("UEZ-Auszahlung gebucht.");
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
        <DialogTitle>UEZ auszahlen</DialogTitle>
        <DialogDescription>
          {uezPayoutPolicy === "WITH_NOTICE" ? (
            <>
              Reduziert das UEZ-Konto um die ausgezahlten Minuten. Bei dieser
              Mandanten-Richtlinie ist zusätzlich entweder ein ausführlicher
              Kommentar (mind. 20 Zeichen) oder der Hinweis an die
              Mitarbeitenden erforderlich; die Angaben werden im Audit-Log
              gespeichert.
            </>
          ) : (
            <>
              Reduziert das UEZ-Konto um die ausgezahlten Minuten. Ein Kommentar
              ist Pflicht und wird im Audit-Log gespeichert.
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="uez-payout-employeeId">Mitarbeitende:r</Label>
          <select
            id="uez-payout-employeeId"
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
            htmlFor="uez-payout-date"
            label="Datum"
            tooltip="Buchungsdatum — bestimmt das Saldojahr."
          />
          <Input
            id="uez-payout-date"
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
            htmlFor="uez-payout-minutes"
            label="Minuten"
            tooltip="Auszuzahlende UEZ-Minuten (z. B. 60 = 1h)."
          />
          <Input
            id="uez-payout-minutes"
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
            htmlFor="uez-payout-comment"
            label={
              uezPayoutPolicy === "WITH_NOTICE"
                ? "Kommentar"
                : "Kommentar (Pflicht)"
            }
            tooltip={
              uezPayoutPolicy === "WITH_NOTICE"
                ? "Kurzer Grund oder längere Begründung (bei mind. 20 Zeichen entfällt der separate Hinweis)."
                : "Wird im Audit-Log gespeichert (z. B. Auszahlungsgrund)."
            }
          />
          <textarea
            id="uez-payout-comment"
            name="comment"
            rows={3}
            required
            minLength={3}
            className="flex min-h-[68px] w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            placeholder={
              uezPayoutPolicy === "WITH_NOTICE"
                ? "Grund — mindestens 3 Zeichen; mit 20+ Zeichen reicht ohne separaten Hinweis."
                : "Grund — bleibt im Audit-Log."
            }
          />
          {fieldErr.comment ? (
            <p className="text-xs text-rose-700">{fieldErr.comment}</p>
          ) : null}
        </div>

        {uezPayoutPolicy === "WITH_NOTICE" ? (
          <div className="space-y-1.5 sm:col-span-2">
            <LabelWithHelp
              htmlFor="uez-payout-notice"
              label="Hinweis an Mitarbeitende (Pflicht, falls Kommentar kürzer als 20 Zeichen)"
              tooltip="Alternative zum langen Kommentar — z. B. Zeitpunkt der Information („informiert am …“)."
            />
            <textarea
              id="uez-payout-notice"
              name="acknowledgedNoticeText"
              rows={2}
              className="flex min-h-[52px] w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              placeholder='z. B. „informiert am 15. März (schriftlich)".'
            />
            {fieldErr.acknowledgedNoticeText ? (
              <p className="text-xs text-rose-700">
                {fieldErr.acknowledgedNoticeText}
              </p>
            ) : (
              <p className="text-xs text-neutral-500">
                Entweder dieser Hinweis oder ein Kommentar mit mindestens 20
                Zeichen ausfüllen.
              </p>
            )}
          </div>
        ) : null}
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
          {pending ? "Buchen..." : "Auszahlung buchen"}
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
