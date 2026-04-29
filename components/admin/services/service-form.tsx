"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpIconTooltip } from "@/components/ui/help-icon-tooltip";
import {
  createServiceAction,
  updateServiceAction,
} from "@/server/services";
import type { ActionResult } from "@/server/_shared";
import { bitmaskHasWeekday } from "@/lib/services/coverage";
import {
  DEFAULT_SERVICE_BLOCK_HEX,
  SERVICE_BLOCK_PRESET_HEX,
  parseBlockColorHex,
} from "@/lib/planning/block-appearance";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;

export interface ServiceFormDefaults {
  id?: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  comment: string;
  defaultDays: number | null;
  requiredCount: number | null;
  isActive: boolean;
  blockColorHex: string | null;
}

interface ServiceFormProps {
  mode: "create" | "edit";
  defaults: ServiceFormDefaults;
  onSuccess?: () => void;
}

interface FormErrors {
  message: string;
  fieldErrors: Record<string, string>;
}

export function ServiceForm({
  mode,
  defaults,
  onSuccess,
}: ServiceFormProps) {
  const [errors, setErrors] = useState<FormErrors | null>(null);
  const [pending, startTransition] = useTransition();

  const resolvedDefaultHex =
    parseBlockColorHex(defaults.blockColorHex) ?? DEFAULT_SERVICE_BLOCK_HEX;
  const [blockColor, setBlockColor] = useState(
    () => resolvedDefaultHex.toLowerCase(),
  );

  function hiddenBlockHex(): string {
    const t = blockColor.trim().replace(/^#/, "");
    return `#${t}`.toUpperCase();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrors(null);
    startTransition(async () => {
      const action =
        mode === "create" ? createServiceAction : updateServiceAction;
      const result: ActionResult = await action(undefined, formData);
      if (result.ok) {
        toast.success(
          mode === "create"
            ? "Dienstvorlage angelegt."
            : "Dienstvorlage aktualisiert.",
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
            ? "Neue Dienstvorlage"
            : "Dienstvorlage bearbeiten"}
        </DialogTitle>
        <DialogDescription>
          Vorlagen werden in der Wochenplanung als Blöcke bereitgestellt.
        </DialogDescription>
      </DialogHeader>

      {mode === "edit" && defaults.id ? (
        <input type="hidden" name="id" value={defaults.id} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          name="name"
          defaultValue={defaults.name}
          required
          error={fieldErr.name}
        />
        <Field
          label="Kürzel"
          name="code"
          defaultValue={defaults.code}
          placeholder="z. B. FRUEH"
          required
          error={fieldErr.code}
          hint="Eindeutiges Kürzel — A-Z, 0-9, _ und -"
          style={{ textTransform: "uppercase" }}
        />
        <div className="sm:col-span-2 space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="blockColorPick">Block-Farbe</Label>
            <HelpIconTooltip text="Wird in der Wochenplanung für Blöcke und Zellen verwendet." />
          </div>
          <input type="hidden" name="blockColorHex" value={hiddenBlockHex()} />
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              id="blockColorPick"
              value={
                blockColor.startsWith("#")
                  ? blockColor
                  : `#${blockColor}`
              }
              onChange={(e) => setBlockColor(e.target.value.toLowerCase())}
              className="h-10 w-14 cursor-pointer rounded-md border border-neutral-300 bg-white p-1"
              aria-label="Block-Farbe wählen"
            />
            <div className="flex flex-wrap gap-2">
              {SERVICE_BLOCK_PRESET_HEX.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={cn(
                    "h-8 w-8 rounded-full ring-2 ring-offset-1 transition-transform hover:scale-105 focus-visible:outline focus-visible:ring-2 focus-visible:ring-neutral-400",
                    hiddenBlockHex() === hex
                      ? "ring-neutral-800"
                      : "ring-transparent",
                  )}
                  style={{ backgroundColor: hex }}
                  title={hex}
                  onClick={() => setBlockColor(hex.toLowerCase())}
                  aria-label={`Farbe ${hex}`}
                />
              ))}
            </div>
          </div>
          {fieldErr.blockColorHex ? (
            <p className="text-xs text-rose-700">{fieldErr.blockColorHex}</p>
          ) : (
            <p className="text-xs text-neutral-500">
              Frei wählbar oder Vorschlag antippen.
            </p>
          )}
        </div>
        <Field
          label="Startzeit"
          name="startTime"
          type="time"
          defaultValue={defaults.startTime}
          required
          error={fieldErr.startTime}
        />
        <Field
          label="Endzeit"
          name="endTime"
          type="time"
          defaultValue={defaults.endTime}
          required
          error={fieldErr.endTime}
        />
        <Field
          label="Pause (Minuten)"
          name="breakMinutes"
          type="number"
          min={0}
          step={5}
          defaultValue={defaults.breakMinutes}
          required
          error={fieldErr.breakMinutes}
        />
        <Field
          label="Kommentar (optional)"
          name="comment"
          defaultValue={defaults.comment}
          placeholder="z. B. Kasse / Öffnung"
          error={fieldErr.comment}
        />
        <Field
          label="Sollbesetzung pro Tag"
          name="requiredCount"
          type="number"
          min={0}
          max={50}
          defaultValue={defaults.requiredCount ?? ""}
          placeholder="z. B. 2"
          error={fieldErr.requiredCount}
          hint="0 oder leer = keine Vorgabe"
          labelHelp="Wieviele Personen pro Tag mit diesem Dienst besetzt sein sollen."
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
          Standardtage
          <HelpIconTooltip text="An welchen Wochentagen dieser Dienst geplant werden muss." />
        </legend>
        <div className="flex flex-wrap gap-3">
          {WEEKDAY_LABELS.map((label, i) => (
            <label
              key={label}
              className="flex items-center gap-1.5 text-sm text-neutral-700"
            >
              <input
                type="checkbox"
                name={`defaultDay${i}`}
                defaultChecked={bitmaskHasWeekday(defaults.defaultDays, i)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              {label}
            </label>
          ))}
        </div>
        {fieldErr.defaultDays ? (
          <p className="text-xs text-rose-700">{fieldErr.defaultDays}</p>
        ) : (
          <p className="text-xs text-neutral-500">
            Keine Auswahl = keine Vorgabe.
          </p>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={defaults.isActive}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Aktiv (in der Wochenplanung verwendbar)
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
  labelHelp?: string;
}

function Field({ label, hint, error, name, labelHelp, ...rest }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={name}>{label}</Label>
        {labelHelp ? <HelpIconTooltip text={labelHelp} /> : null}
      </div>
      <Input id={name} name={name} {...rest} />
      {error ? (
        <p className="text-xs text-rose-700">{error}</p>
      ) : hint ? (
        <p className="text-xs text-neutral-500">{hint}</p>
      ) : null}
    </div>
  );
}
