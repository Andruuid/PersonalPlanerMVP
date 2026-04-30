"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpIconTooltip } from "@/components/ui/help-icon-tooltip";
import { grantParentalCareAction } from "@/server/accounts";

export interface ParentalCareGrantEmployeeOption {
  employeeId: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

interface Props {
  employees: ParentalCareGrantEmployeeOption[];
  bookingDateIso: string;
}

export function ParentalCareGrantForm({
  employees,
  bookingDateIso,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState("");
  const [days, setDays] = useState("");
  const [comment, setComment] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    const daysNum = Number(days.replace(",", "."));
    startTransition(async () => {
      const result = await grantParentalCareAction(
        employeeId,
        daysNum,
        comment,
      );
      if (result.ok) {
        toast.success("Eltern-/Betreuungsurlaub freigeschaltet.");
        setDays("");
        setComment("");
        return;
      }
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      toast.error(result.error);
    });
  }

  if (employees.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Keine Mitarbeitenden für eine Freigabe verfügbar.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-xs text-neutral-500">
        Buchungsdatum: <span className="font-mono">{bookingDateIso}</span>{" "}
        (heute)
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="pcg-employee">Mitarbeitende:r</Label>
            <HelpIconTooltip text="Freigabe gutgeschrieben auf das Konto Eltern-/Betreuungsurlaub (Tage)." />
          </div>
          <select
            id="pcg-employee"
            required
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            <option value="">— auswählen —</option>
            {employees.map((e) => (
              <option key={e.employeeId} value={e.employeeId}>
                {e.lastName}, {e.firstName}
                {!e.isActive ? " (inaktiv)" : ""}
              </option>
            ))}
          </select>
          {fieldErrors.employeeId ? (
            <p className="text-xs text-rose-700">{fieldErrors.employeeId}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pcg-days">Tage</Label>
          <Input
            id="pcg-days"
            type="number"
            min={0.5}
            step={0.5}
            required
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          {fieldErrors.days ? (
            <p className="text-xs text-rose-700">{fieldErrors.days}</p>
          ) : null}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="pcg-comment">Begründung</Label>
            <HelpIconTooltip text="Pflichtfeld (mind. 10 Zeichen), erscheint in der Buchung und im Audit." />
          </div>
          <textarea
            id="pcg-comment"
            required
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            placeholder="z. B. Freigabe gemäss interner Regelung / Amtsbescheid …"
          />
          {fieldErrors.comment ? (
            <p className="text-xs text-rose-700">{fieldErrors.comment}</p>
          ) : null}
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Speichern…" : "Freischalten"}
      </Button>
    </form>
  );
}
