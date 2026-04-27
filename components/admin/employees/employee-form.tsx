"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  createEmployeeAction,
  updateEmployeeAction,
} from "@/server/employees";
import type { ActionResult } from "@/server/_shared";

export interface LocationOption {
  id: string;
  name: string;
}

export interface EmployeeFormDefaults {
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  roleLabel: string;
  pensum: number;
  entryDate: string;
  exitDate: string;
  locationId: string;
  vacationDaysPerYear: number;
  weeklyTargetMinutes: number;
  hazMinutesPerWeek: number;
  isActive: boolean;
}

interface EmployeeFormProps {
  mode: "create" | "edit";
  defaults: EmployeeFormDefaults;
  locations: LocationOption[];
  onSuccess?: () => void;
}

interface FormErrors {
  message: string;
  fieldErrors: Record<string, string>;
}

export function EmployeeForm({
  mode,
  defaults,
  locations,
  onSuccess,
}: EmployeeFormProps) {
  const [errors, setErrors] = useState<FormErrors | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrors(null);
    startTransition(async () => {
      const action =
        mode === "create" ? createEmployeeAction : updateEmployeeAction;
      const result: ActionResult = await action(undefined, formData);
      if (result.ok) {
        toast.success(
          mode === "create"
            ? "Mitarbeitende:r angelegt."
            : "Mitarbeitende:r aktualisiert.",
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
          {mode === "create"
            ? "Neuen Mitarbeitenden anlegen"
            : "Mitarbeitende:n bearbeiten"}
        </DialogTitle>
        <DialogDescription>
          Persönliche Daten, Pensum und Anstellung bearbeiten.
        </DialogDescription>
      </DialogHeader>

      {mode === "edit" && defaults.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Vorname"
          name="firstName"
          defaultValue={defaults.firstName}
          required
          error={fieldErr.firstName}
        />
        <Field
          label="Nachname"
          name="lastName"
          defaultValue={defaults.lastName}
          required
          error={fieldErr.lastName}
        />
        <Field
          label="E-Mail"
          name="email"
          type="email"
          defaultValue={defaults.email}
          required
          error={fieldErr.email}
        />
        <Field
          label={mode === "create" ? "Passwort" : "Passwort (leer = unverändert)"}
          name="password"
          type="password"
          required={mode === "create"}
          error={fieldErr.password}
        />
        <Field
          label="Funktion / Rolle"
          name="roleLabel"
          placeholder="z. B. Verkauf"
          defaultValue={defaults.roleLabel}
          error={fieldErr.roleLabel}
        />
        <SelectField
          label="Standort"
          name="locationId"
          defaultValue={defaults.locationId}
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
          required
          error={fieldErr.locationId}
        />
        <Field
          label="Pensum (%)"
          name="pensum"
          type="number"
          min={0}
          max={100}
          defaultValue={defaults.pensum}
          required
          error={fieldErr.pensum}
        />
        <Field
          label="Ferienanspruch (Tage / Jahr)"
          name="vacationDaysPerYear"
          type="number"
          step={0.5}
          min={0}
          defaultValue={defaults.vacationDaysPerYear}
          required
          error={fieldErr.vacationDaysPerYear}
        />
        <Field
          label="Eintritt"
          name="entryDate"
          type="date"
          defaultValue={defaults.entryDate}
          required
          error={fieldErr.entryDate}
        />
        <Field
          label="Austritt (optional)"
          name="exitDate"
          type="date"
          defaultValue={defaults.exitDate}
          error={fieldErr.exitDate}
        />
        <Field
          label="Wöchentliche Sollzeit (Minuten)"
          name="weeklyTargetMinutes"
          type="number"
          min={0}
          step={1}
          defaultValue={defaults.weeklyTargetMinutes}
          hint="Standard: 2520 (42h × 60)"
          required
          error={fieldErr.weeklyTargetMinutes}
        />
        <Field
          label="HAZ pro Woche (Minuten)"
          name="hazMinutesPerWeek"
          type="number"
          min={0}
          step={1}
          defaultValue={defaults.hazMinutesPerWeek}
          hint="Standard: 2700 (45h) oder 3000 (50h)"
          required
          error={fieldErr.hazMinutesPerWeek}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={defaults.isActive}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Aktiv (kann sich anmelden und wird in der Planung angezeigt)
      </label>

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

interface FieldProps extends Omit<React.ComponentProps<"input">, "size"> {
  label: string;
  hint?: string;
  error?: string;
}

function Field({ label, hint, error, name, ...rest }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...rest} />
      {error ? (
        <p className="text-xs text-rose-700">{error}</p>
      ) : hint ? (
        <p className="text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  error?: string;
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  required,
  error,
}: SelectFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
