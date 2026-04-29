"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpIconTooltip } from "@/components/ui/help-icon-tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateTenantBusinessDefaultsAction } from "@/server/settings";

export type UezPayoutPolicyValue = "ALLOWED" | "WITH_NOTICE" | "BLOCKED";

interface Props {
  defaultStandardWorkDays: number;
  defaultWeeklyTargetMinutes: number;
  defaultHazMinutesPerWeek: number;
  zeitsaldoMinLimitMinutes: number | null;
  uezPayoutPolicy: UezPayoutPolicyValue;
  ertDueDays: number;
  compensationDueDays: number;
}

export function BusinessDataCard({
  defaultStandardWorkDays,
  defaultWeeklyTargetMinutes,
  defaultHazMinutesPerWeek,
  zeitsaldoMinLimitMinutes,
  uezPayoutPolicy,
  ertDueDays,
  compensationDueDays,
}: Props) {
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
      const result = await updateTenantBusinessDefaultsAction(undefined, formData);
      if (result.ok) {
        toast.success("Betriebsdaten gespeichert.");
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
    <Card>
      <CardHeader>
        <CardTitle>Betriebsdaten</CardTitle>
        <CardDescription>
          Stammdaten für Sollzeit, HAZ, Zeitsaldo-Untergrenze und UEZ-Auszahlung (Spec).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-1.5">
              <LabelRow
                htmlFor="defaultStandardWorkDays"
                label="Standard-Arbeitstage pro Woche"
                tooltip="Verteilung des Wochensolls auf Arbeitstage; üblicherweise 5."
              />
              <Input
                id="defaultStandardWorkDays"
                name="defaultStandardWorkDays"
                type="number"
                min={1}
                max={7}
                step={1}
                defaultValue={defaultStandardWorkDays}
                required
              />
              {fieldErr.defaultStandardWorkDays ? (
                <p className="text-xs text-rose-700">
                  {fieldErr.defaultStandardWorkDays}
                </p>
              ) : (
                <p className="text-xs text-neutral-500">
                  Wochensoll wird durch diese Anzahl geteilt (Vorschlagswert bei neuen
                  Mitarbeitenden ohne individuelle Arbeitstage).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <LabelRow
                htmlFor="defaultWeeklyTargetMinutes"
                label="Vollzeit-Wochensoll (Minuten)"
                tooltip="Vorschlagswert beim Anlegen neuer Mitarbeitender für die wöchentliche Sollzeit (Zeitsaldo-Basis)."
              />
              <Input
                id="defaultWeeklyTargetMinutes"
                name="defaultWeeklyTargetMinutes"
                type="number"
                min={0}
                max={10080}
                step={1}
                defaultValue={defaultWeeklyTargetMinutes}
                required
              />
              {fieldErr.defaultWeeklyTargetMinutes ? (
                <p className="text-xs text-rose-700">
                  {fieldErr.defaultWeeklyTargetMinutes}
                </p>
              ) : (
                <p className="text-xs text-neutral-500">
                  Standard-Vollzeit oft 2520 (42h × 60); im Formular leer lassen übernimmt
                  diesen Firmenwert.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <LabelRow
                htmlFor="defaultHazMinutesPerWeek"
                label="HAZ pro Woche — Firmen-Vorschlag (Minuten)"
                tooltip="Arbeitszeitgesetz: Höchstarbeitszeit pro Woche je Gruppe/Betrieb als Vorschlagswert für neue Mitarbeitende; darüber schreibt die Automatik typischerweise UEZ gut."
              />
              <Input
                id="defaultHazMinutesPerWeek"
                name="defaultHazMinutesPerWeek"
                type="number"
                min={0}
                max={10080}
                step={1}
                defaultValue={defaultHazMinutesPerWeek}
                required
              />
              {fieldErr.defaultHazMinutesPerWeek ? (
                <p className="text-xs text-rose-700">
                  {fieldErr.defaultHazMinutesPerWeek}
                </p>
              ) : (
                <p className="text-xs text-neutral-500">
                  Häufig 2700 (45h) oder 3000 (50h); Vorschlag beim Anlegen neuer
                  Stammdaten.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <LabelRow
                htmlFor="zeitsaldoMinLimitMinutes"
                label="Zeitsaldo — Mindestgrenze (Minuten, optional)"
                tooltip="Administrative Untergrenze (z. B. Vortrag aus Vertrag): leer = keine Untergrenze / kein Block beim Erfassen unterhalb eines negativen Limits."
              />
              <Input
                id="zeitsaldoMinLimitMinutes"
                name="zeitsaldoMinLimitMinutes"
                type="number"
                step={1}
                placeholder="Keine Grenze"
                defaultValue={
                  zeitsaldoMinLimitMinutes === null ? "" : zeitsaldoMinLimitMinutes
                }
              />
              {fieldErr.zeitsaldoMinLimitMinutes ? (
                <p className="text-xs text-rose-700">
                  {fieldErr.zeitsaldoMinLimitMinutes}
                </p>
              ) : (
                <p className="text-xs text-neutral-500">
                  Negativ erlaubt (Minuslimit). Leer lassen = keine Sperre durch diese
                  Stammdaten-Grenze.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <LabelRow
                htmlFor="ertDueDays"
                label="ERT — Frist (Kalendertage)"
                tooltip="Zeitraum bis zur Wahrung der Ruhezeit / ERT-Ausgleich nach Feiertagsarbeit über 5 Stunden (dueAt = Auslöserdatum + Frist)."
              />
              <Input
                id="ertDueDays"
                name="ertDueDays"
                type="number"
                min={1}
                max={366}
                step={1}
                defaultValue={ertDueDays}
                required
              />
              {fieldErr.ertDueDays ? (
                <p className="text-xs text-rose-700">{fieldErr.ertDueDays}</p>
              ) : (
                <p className="text-xs text-neutral-500">
                  Typisch 28 Tage (4 Wochen); steuert das Erfüllungsfenster für 35h Ruhe.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <LabelRow
                htmlFor="compensationDueDays"
                label="Sonn-/Feiertags-Kompensation — Frist (Tage)"
                tooltip="Kalendertage bis zur Einlösung der Kompensation bei bis zu 5h Feiertagsarbeit; danach kann der Fall ablaufen."
              />
              <Input
                id="compensationDueDays"
                name="compensationDueDays"
                type="number"
                min={1}
                max={730}
                step={1}
                defaultValue={compensationDueDays}
                required
              />
              {fieldErr.compensationDueDays ? (
                <p className="text-xs text-rose-700">
                  {fieldErr.compensationDueDays}
                </p>
              ) : (
                <p className="text-xs text-neutral-500">
                  Typisch 180 Tage (ca. 6 Monate) gemäss üblicher Staffelung.
                </p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <LabelRow
                htmlFor="uezPayoutPolicy"
                label="UEZ-Auszahlung"
                tooltip="Regel für Auszahlung Überstundenersatzzeit: erlaubt, nur mit Hinweis oder gesperrt — steuert später Erfassung und Hinweise."
              />
              <select
                id="uezPayoutPolicy"
                name="uezPayoutPolicy"
                defaultValue={uezPayoutPolicy}
                required
                className="flex h-9 w-full max-w-md rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              >
                <option value="ALLOWED">Erlaubt</option>
                <option value="WITH_NOTICE">Mit Hinweis / Freigabe</option>
                <option value="BLOCKED">Gesperrt</option>
              </select>
              {fieldErr.uezPayoutPolicy ? (
                <p className="text-xs text-rose-700">{fieldErr.uezPayoutPolicy}</p>
              ) : (
                <p className="text-xs text-neutral-500">
                  Betriebliche Vorgabe zur Auszahlung von UEZ-Stunden (Auswirkung bei
                  Buchungen gemäss späterer Implementierung).
                </p>
              )}
            </div>
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "Speichern..." : "Speichern"}
          </Button>

          {errors?.message ? (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
              {errors.message}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function LabelRow({
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
