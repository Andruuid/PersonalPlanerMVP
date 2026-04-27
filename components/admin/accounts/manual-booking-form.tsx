"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { manualBookingAction } from "@/server/bookings";
import type { ActionResult } from "@/server/_shared";

export interface EmployeePickOption {
  id: string;
  label: string;
}

export interface ManualBookingFormDefaults {
  employeeId: string;
  accountType: "ZEITSALDO" | "FERIEN" | "UEZ" | "TZT";
  date: string;
  bookingType: "MANUAL_CREDIT" | "MANUAL_DEBIT" | "CORRECTION";
  comment?: string;
}

interface Props {
  employees: EmployeePickOption[];
  defaults: ManualBookingFormDefaults;
  onSuccess?: () => void;
}

const ACCOUNT_OPTIONS: Array<{
  value: ManualBookingFormDefaults["accountType"];
  label: string;
  hint: string;
}> = [
  { value: "ZEITSALDO", label: "Zeitsaldo", hint: "Wert in Minuten (z. B. 60 = +1h)" },
  { value: "FERIEN", label: "Ferien", hint: "Wert in Tagen (z. B. 0.5 = halber Tag)" },
  { value: "UEZ", label: "UEZ", hint: "Wert in Minuten" },
  { value: "TZT", label: "TZT", hint: "Wert in Tagen" },
];

const TYPE_OPTIONS: Array<{
  value: ManualBookingFormDefaults["bookingType"];
  label: string;
}> = [
  { value: "MANUAL_CREDIT", label: "Gutschrift (+)" },
  { value: "MANUAL_DEBIT", label: "Belastung (−)" },
  { value: "CORRECTION", label: "Korrektur" },
];

export function ManualBookingForm({ employees, defaults, onSuccess }: Props) {
  const [errors, setErrors] = useState<{
    message: string;
    fieldErrors: Record<string, string>;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [accountType, setAccountType] = useState(defaults.accountType);

  const accountHint =
    ACCOUNT_OPTIONS.find((o) => o.value === accountType)?.hint ?? "";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrors(null);
    startTransition(async () => {
      const result: ActionResult = await manualBookingAction(
        undefined,
        formData,
      );
      if (result.ok) {
        toast.success("Buchung gespeichert.");
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
        <DialogTitle>Manuelle Buchung erfassen</DialogTitle>
        <DialogDescription>
          Audit-pflichtige Korrektur oder Gutschrift für ein Zeitkonto. Ein
          Kommentar ist Pflicht.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="employeeId">Mitarbeitende:r</Label>
          <select
            id="employeeId"
            name="employeeId"
            defaultValue={defaults.employeeId}
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
          <Label htmlFor="accountType">Konto</Label>
          <select
            id="accountType"
            name="accountType"
            value={accountType}
            onChange={(e) =>
              setAccountType(
                e.target.value as ManualBookingFormDefaults["accountType"],
              )
            }
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            {ACCOUNT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {fieldErr.accountType ? (
            <p className="text-xs text-rose-700">{fieldErr.accountType}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bookingType">Buchungsart</Label>
          <select
            id="bookingType"
            name="bookingType"
            defaultValue={defaults.bookingType}
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="date">Datum</Label>
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
          <Label htmlFor="value">Wert</Label>
          <Input
            id="value"
            name="value"
            type="number"
            step="0.5"
            inputMode="decimal"
            placeholder="z. B. 60 oder 0.5"
            required
          />
          {fieldErr.value ? (
            <p className="text-xs text-rose-700">{fieldErr.value}</p>
          ) : (
            <p className="text-xs text-neutral-500">{accountHint}</p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="comment">Kommentar (Pflicht)</Label>
          <textarea
            id="comment"
            name="comment"
            rows={3}
            defaultValue={defaults.comment ?? ""}
            required
            className="flex min-h-[68px] w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            placeholder="Grund der Buchung — bleibt im Audit-Log."
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
          {pending ? "Buchen..." : "Buchen"}
        </Button>
      </DialogFooter>
    </form>
  );
}
