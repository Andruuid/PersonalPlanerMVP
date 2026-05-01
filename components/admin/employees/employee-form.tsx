"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpIconTooltip } from "@/components/ui/help-icon-tooltip";
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

export type TztModelValue = "DAILY_QUOTA" | "TARGET_REDUCTION";

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
  tztModel: TztModelValue;
  /** Periodisches TZT-Kontingent (Modell 1); leer = keine Cron-Freigabe */
  tztPeriodicQuotaDays?: number | null;
  tztPeriodMonths?: number | null;
  /** Gesetzt = Override; `undefined`/null + leeres Feld = Tenant-Standard */
  standardWorkDays?: number | null;
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
  const [tztModel, setTztModel] = useState<TztModelValue>(defaults.tztModel);

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
          tooltip="Jährlicher Ferienanspruch als Stammdatum; initialisiert den Eröffnungswert des Ferienkontos je Jahr."
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
          tooltip="Wöchentliche Sollzeit für die Zeitsaldo-Berechnung; wird auf die Standardarbeitstage verteilt. Vorschlagswert beim Anlegen neuer Mitarbeitender aus den Betriebsdaten."
          hint={
            mode === "create"
              ? "Leer lassen = Vorschlagswerte aus Einstellungen › Betriebsdaten (aktuell im Formular vorbefüllt)."
              : "Standard oft 2520 (42h × 60), je nach Firmenvorgabe."
          }
          required={mode === "edit"}
          error={fieldErr.weeklyTargetMinutes}
        />
        <Field
          label="Individuelle Arbeitstage/Woche"
          name="standardWorkDays"
          type="number"
          min={1}
          max={7}
          step={1}
          defaultValue={
            defaults.standardWorkDays === undefined ||
            defaults.standardWorkDays === null
              ? ""
              : defaults.standardWorkDays
          }
          tooltip="Leer lassen = Tenant-Standard (Einstellungen › Betriebsdaten)."
          hint="Leer = Firmen-Standard"
          error={fieldErr.standardWorkDays}
        />
        <Field
          label="HAZ pro Woche (Minuten)"
          name="hazMinutesPerWeek"
          type="number"
          min={0}
          step={1}
          defaultValue={defaults.hazMinutesPerWeek}
          tooltip="HAZ-Schwelle pro Woche; oberhalb davon schreibt die Wochenautomatik UEZ gut. Firmen-Vorschlag beim Anlegen neuer Mitarbeitender."
          hint={
            mode === "create"
              ? "Leer lassen = Firmen-HAZ aus Betriebsdaten (Formular zeigt den Vorschlag)."
              : "Typisch 2700 (45h) oder 3000 (50h)."
          }
          required={mode === "edit"}
          error={fieldErr.hazMinutesPerWeek}
        />
        <SelectField
          label="TZT-Modell"
          name="tztModel"
          defaultValue={defaults.tztModel}
          tooltip="Modell 1: TZT bleibt über anrechenbare Istzeit Soll-/Ist-neutral. Modell 2: TZT reduziert die Tagessollzeit."
          options={[
            {
              value: "DAILY_QUOTA",
              label: "Modell 1 — Tageskontingent",
            },
            {
              value: "TARGET_REDUCTION",
              label: "Modell 2 — Sollzeit-Reduktion",
            },
          ]}
          required
          error={fieldErr.tztModel}
          onChange={(e) =>
            setTztModel(e.target.value as TztModelValue)
          }
        />
        {tztModel === "DAILY_QUOTA" ? (
          <>
            <Field
              label="TZT-Zuschlag je Periode (Tage)"
              name="tztPeriodicQuotaDays"
              type="number"
              step={0.5}
              min={0}
              defaultValue={
                defaults.tztPeriodicQuotaDays === undefined ||
                defaults.tztPeriodicQuotaDays === null
                  ? ""
                  : defaults.tztPeriodicQuotaDays
              }
              tooltip="Wird bei aktiviertem Rhythmus automatisch per täglichem Cron auf das TZT-Konto gutgeschrieben (MANUAL_CREDIT)."
              hint="Leer und ohne Rhythmus = keine automatische Erhöhung."
              error={fieldErr.tztPeriodicQuotaDays}
            />
            <div className="space-y-1.5">
              <LabelWithHelp
                htmlFor="tztPeriodMonths"
                label="Periodische Freigabe"
                tooltip="Abstand zwischen automatischen Gutschriften. Erfordert positiven Zuschlag je Periode."
              />
              <select
                id="tztPeriodMonths"
                name="tztPeriodMonths"
                defaultValue={
                  defaults.tztPeriodMonths != null
                    ? String(defaults.tztPeriodMonths)
                    : ""
                }
                className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              >
                <option value="">Keine (nur Anfangsbestand / manuelle Buchungen)</option>
                <option value="1">Monatlich</option>
                <option value="3">Quartalsweise</option>
                <option value="6">Halbjährlich</option>
                <option value="12">Jährlich</option>
              </select>
              {fieldErr.tztPeriodMonths ? (
                <p className="text-xs text-rose-700">{fieldErr.tztPeriodMonths}</p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {mode === "create" ? (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50/80 p-4">
          <p className="text-sm font-medium text-neutral-900">
            Anfangsbestände (optional)
            <HelpTooltip text="Nur Werte ungleich 0 werden gebucht. Die Buchung erfolgt als OPENING auf das Eintrittsdatum." />
          </p>
          <p className="text-xs text-neutral-600">
            Werte werden am Eintrittsdatum als Eröffnungsbuchungen (
            <span className="font-mono">OPENING</span>) für das Jahr des
            Eintritts gebucht. Leer oder 0 = keine Zusatzbuchung.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Zeitsaldo (Minuten)"
              name="openingZeitsaldoMinutes"
              type="number"
              step={1}
              defaultValue={0}
              tooltip="Startwert im Zeitsaldo-Konto (Minuten). Positiv = Guthaben, negativ = Belastung."
              error={fieldErr.openingZeitsaldoMinutes}
            />
            <Field
              label="Überstunden / UEZ (Minuten)"
              name="openingUezMinutes"
              type="number"
              step={1}
              defaultValue={0}
              tooltip="Startwert für das UEZ-Konto in Minuten."
              error={fieldErr.openingUezMinutes}
            />
            <Field
              label="Ferien (Tage)"
              name="openingVacationDays"
              type="number"
              step={0.5}
              defaultValue={0}
              tooltip="Zusätzlicher Ferien-Startbestand in Tagen; wird intern mit dem persönlichen Tagessoll in Minuten gebucht und ist additiv zum jährlichen Ferienanspruch."
              hint="Eingabe in Tagen; Buchung nutzt Tagessoll-Minuten. Zusätzlich wird der Jahresanspruch separat initialisiert."
              error={fieldErr.openingVacationDays}
            />
            <Field
              label="TZT (Tage)"
              name="openingTztDays"
              type="number"
              step={0.5}
              defaultValue={0}
              tooltip="Startwert für das TZT-Konto in Tagen."
              error={fieldErr.openingTztDays}
            />
            <Field
              label="Eltern-/Betreuung (Tage)"
              name="openingParentalCareDays"
              type="number"
              step={0.5}
              defaultValue={0}
              tooltip="Anfangsbestand für das Eltern-/Betreuungskonto in Arbeitstagen (Vortrag)."
              error={fieldErr.openingParentalCareDays}
            />
          </div>
        </div>
      ) : null}

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
  tooltip?: string;
  hint?: string;
  error?: string;
}

function Field({ label, tooltip, hint, error, name, ...rest }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <LabelWithHelp htmlFor={name} label={label} tooltip={tooltip} />
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
  tooltip?: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  error?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
}

function SelectField({
  label,
  tooltip,
  name,
  defaultValue,
  options,
  required,
  error,
  onChange,
}: SelectFieldProps) {
  return (
    <div className="space-y-1.5">
      <LabelWithHelp htmlFor={name} label={label} tooltip={tooltip} />
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
        onChange={onChange}
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

function LabelWithHelp({
  htmlFor,
  label,
  tooltip,
}: {
  htmlFor?: string;
  label: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {tooltip ? <HelpTooltip text={tooltip} /> : null}
    </div>
  );
}

function HelpTooltip({ text }: { text: string }) {
  return <HelpIconTooltip text={text} />;
}
