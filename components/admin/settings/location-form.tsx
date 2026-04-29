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
import {
  createLocationAction,
  updateLocationAction,
} from "@/server/locations";
import type { ActionResult } from "@/server/_shared";

export type HolidayConfession = "EVANGELISCH" | "KATHOLISCH";

export interface LocationFormDefaults {
  id?: string;
  name: string;
  holidayRegionCode: HolidayConfession;
}

interface Props {
  mode: "create" | "edit";
  defaults: LocationFormDefaults;
  onSuccess?: () => void;
}

export function LocationForm({ mode, defaults, onSuccess }: Props) {
  const [errors, setErrors] = useState<{
    message: string;
    fieldErrors: Record<string, string>;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrors(null);
    startTransition(async () => {
      const action =
        mode === "create" ? createLocationAction : updateLocationAction;
      const result: ActionResult = await action(undefined, formData);
      if (result.ok) {
        toast.success(
          mode === "create"
            ? "Standort angelegt."
            : "Standort aktualisiert.",
        );
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
        <DialogTitle>
          {mode === "create" ? "Neuer Standort" : "Standort bearbeiten"}
        </DialogTitle>
        <DialogDescription>
          Standorte werden Mitarbeitenden zugeordnet und steuern den
          Feiertagskalender.
        </DialogDescription>
      </DialogHeader>

      {mode === "edit" && defaults.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaults.name}
          required
          placeholder="z. B. Standort Luzern"
        />
        {fieldErr.name ? (
          <p className="text-xs text-rose-700">{fieldErr.name}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="holidayRegionCode">Konfession</Label>
        <select
          id="holidayRegionCode"
          name="holidayRegionCode"
          defaultValue={defaults.holidayRegionCode}
          required
          className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          <option value="EVANGELISCH">Evangelisch</option>
          <option value="KATHOLISCH">Katholisch</option>
        </select>
        <p className="text-xs text-neutral-500">
          Bestimmt den Feiertagskalender: beide Varianten umfassen die
          eidgenössischen Tage und den 1. August. Katholisch ergänzt
          Fronleichnam, Mariä Himmelfahrt, Allerheiligen und Mariä Empfängnis.
        </p>
        {fieldErr.holidayRegionCode ? (
          <p className="text-xs text-rose-700">{fieldErr.holidayRegionCode}</p>
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
          {pending
            ? "Speichern..."
            : mode === "create"
              ? "Anlegen"
              : "Speichern"}
        </Button>
      </DialogFooter>
    </form>
  );
}
