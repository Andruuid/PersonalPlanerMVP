"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpIconTooltip } from "@/components/ui/help-icon-tooltip";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UpsertPlanEntryInput } from "@/lib/planning/plan-entry-schemas";
import {
  upsertPlanEntryAction,
  deletePlanEntryAction,
} from "@/server/planning";
import type { ServiceOption, PlanEntryView } from "./types";

interface AssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekId: string;
  employeeName: string;
  employeeId: string;
  isoDate: string;
  longDate: string;
  services: ServiceOption[];
  initialEntry: PlanEntryView | null;
}

interface AssignmentFormProps
  extends Omit<AssignmentDialogProps, "open" | "onOpenChange"> {
  onClose: () => void;
}

type Tab = "SHIFT" | "ONE_TIME_SHIFT" | "ABSENCE";

const ABSENCE_OPTIONS: Array<{
  value: NonNullable<UpsertPlanEntryInput & { kind: "ABSENCE" }>["absenceType"];
  label: string;
}> = [
  { value: "VACATION", label: "Ferien" },
  { value: "FREE_REQUESTED", label: "Frei verlangt" },
  { value: "TZT", label: "TZT" },
  { value: "SICK", label: "Krank" },
  { value: "ACCIDENT", label: "Unfall" },
  { value: "UNPAID", label: "Unbezahlter Urlaub" },
  { value: "PARENTAL_CARE", label: "Eltern-/Betreuungsurlaub" },
  { value: "MILITARY_SERVICE", label: "Militärdienst" },
  { value: "CIVIL_PROTECTION_SERVICE", label: "Zivilschutz" },
  { value: "CIVIL_SERVICE", label: "Zivildienst" },
  { value: "HOLIDAY_AUTO", label: "Feiertag" },
];

export function AssignmentDialog(props: AssignmentDialogProps) {
  const { open, onOpenChange } = props;
  // Re-mount the form whenever the dialog opens for a different cell so
  // every state value is initialized from props (no setState-in-effect).
  const formKey = `${props.employeeId}__${props.isoDate}__${props.initialEntry?.id ?? "new"}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? (
          <AssignmentForm
            key={formKey}
            {...props}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AssignmentForm({
  weekId,
  employeeId,
  employeeName,
  isoDate,
  longDate,
  services,
  initialEntry,
  onClose,
}: AssignmentFormProps) {
  const [tab, setTab] = useState<Tab>(initialEntry?.kind ?? "SHIFT");
  const [serviceId, setServiceId] = useState<string>(
    initialEntry?.serviceTemplateId ?? services[0]?.id ?? "",
  );
  const [oneTimeStart, setOneTimeStart] = useState<string>(
    initialEntry?.oneTimeStart ?? "08:00",
  );
  const [oneTimeEnd, setOneTimeEnd] = useState<string>(
    initialEntry?.oneTimeEnd ?? "17:00",
  );
  const [oneTimeBreak, setOneTimeBreak] = useState<number>(
    initialEntry?.oneTimeBreakMinutes ?? 30,
  );
  const [oneTimeLabel, setOneTimeLabel] = useState<string>(
    initialEntry?.oneTimeLabel ?? "",
  );
  const [absence, setAbsence] = useState<
    | "VACATION"
    | "SICK"
    | "ACCIDENT"
    | "FREE_REQUESTED"
    | "UNPAID"
    | "TZT"
    | "PARENTAL_CARE"
    | "MILITARY_SERVICE"
    | "CIVIL_PROTECTION_SERVICE"
    | "CIVIL_SERVICE"
    | "HOLIDAY_AUTO"
  >(initialEntry?.absenceType ?? "VACATION");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    let payload: UpsertPlanEntryInput;
    if (tab === "SHIFT") {
      if (!serviceId) {
        setError("Bitte Dienstvorlage wählen.");
        return;
      }
      payload = {
        kind: "SHIFT",
        weekId,
        employeeId,
        date: isoDate,
        serviceTemplateId: serviceId,
      };
    } else if (tab === "ONE_TIME_SHIFT") {
      if (!oneTimeLabel.trim()) {
        setError("Bezeichnung erforderlich.");
        return;
      }
      payload = {
        kind: "ONE_TIME_SHIFT",
        weekId,
        employeeId,
        date: isoDate,
        oneTimeStart,
        oneTimeEnd,
        oneTimeBreakMinutes: oneTimeBreak,
        oneTimeLabel,
      };
    } else {
      payload = {
        kind: "ABSENCE",
        weekId,
        employeeId,
        date: isoDate,
        absenceType: absence,
      };
    }

    startTransition(async () => {
      try {
        const result = await upsertPlanEntryAction(payload);
        if (result.ok) {
          toast.success("Eintrag gespeichert.");
          onClose();
        } else {
          setError(result.error);
        }
      } catch (e) {
        console.error("[AssignmentDialog] upsertPlanEntryAction", e);
        setError(
          "Unerwarteter Serverfehler. In der Entwicklertools-Konsole (F12) und in den Netlify-Function-Logs finden sich Details.",
        );
      }
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      try {
        const result = await deletePlanEntryAction(weekId, employeeId, isoDate);
        if (result.ok) {
          toast.success("Eintrag entfernt.");
          onClose();
        } else {
          toast.error(result.error);
        }
      } catch (e) {
        console.error("[AssignmentDialog] deletePlanEntryAction", e);
        toast.error(
          "Unerwarteter Serverfehler — siehe Konsole (F12) bzw. Netlify-Logs.",
        );
      }
    });
  }

  const busy = pending || deletePending;

  return (
    <>
      <DialogHeader>
          <DialogTitle>Eintrag bearbeiten</DialogTitle>
          <DialogDescription>
            {employeeName} · {longDate}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 rounded-full bg-neutral-100 p-1 text-sm">
          <TabButton active={tab === "SHIFT"} onClick={() => setTab("SHIFT")}>
            Dienstvorlage
          </TabButton>
          <TabButton
            active={tab === "ONE_TIME_SHIFT"}
            onClick={() => setTab("ONE_TIME_SHIFT")}
          >
            Einmal-Dienst
          </TabButton>
          <TabButton
            active={tab === "ABSENCE"}
            onClick={() => setTab("ABSENCE")}
          >
            Abwesenheit
          </TabButton>
        </div>

        {tab === "SHIFT" ? (
          <div className="space-y-2">
            <LabelWithHelp
              htmlFor="serviceId"
              label="Dienstvorlage"
              tooltip="Übernimmt Start, Ende und Pause aus der hinterlegten Vorlage."
            />
            <select
              id="serviceId"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm"
            >
              {services.length === 0 ? (
                <option value="">Keine Vorlagen vorhanden</option>
              ) : null}
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.startTime}–{s.endTime}
                  {s.breakMinutes ? ` · ${s.breakMinutes}′ Pause` : ""}
                </option>
              ))}
            </select>
            {services.length === 0 ? (
              <p className="text-xs text-rose-700">
                Bitte zuerst Dienstvorlagen unter «Dienste» anlegen.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "ONE_TIME_SHIFT" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <LabelWithHelp
                htmlFor="oneTimeLabel"
                label="Bezeichnung"
                tooltip="Freie Bezeichnung für den einmaligen Einsatz, z. B. Inventur."
              />
              <Input
                id="oneTimeLabel"
                value={oneTimeLabel}
                onChange={(e) => setOneTimeLabel(e.target.value)}
                placeholder="z. B. Inventur"
              />
            </div>
            <div className="space-y-1.5">
              <LabelWithHelp
                htmlFor="oneTimeStart"
                label="Start"
                tooltip="Startzeit des einmaligen Dienstes."
              />
              <Input
                id="oneTimeStart"
                type="time"
                value={oneTimeStart}
                onChange={(e) => setOneTimeStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <LabelWithHelp
                htmlFor="oneTimeEnd"
                label="Ende"
                tooltip="Endzeit des einmaligen Dienstes."
              />
              <Input
                id="oneTimeEnd"
                type="time"
                value={oneTimeEnd}
                onChange={(e) => setOneTimeEnd(e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <LabelWithHelp
                htmlFor="oneTimeBreak"
                label="Pause (Minuten)"
                tooltip="Unbezahlte Pause in Minuten; reduziert die geplante Arbeitszeit."
              />
              <Input
                id="oneTimeBreak"
                type="number"
                min={0}
                max={240}
                value={oneTimeBreak}
                onChange={(e) =>
                  setOneTimeBreak(Number.parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
          </div>
        ) : null}

        {tab === "ABSENCE" ? (
          <div className="space-y-2">
            <LabelWithHelp
              htmlFor="absence"
              label="Abwesenheitstyp"
              tooltip="Bestimmt die Kontologik, z. B. Ferienabbau, Sollzeitwirkung oder Zeitsaldo-Effekt."
            />
            <select
              id="absence"
              value={absence}
              onChange={(e) =>
                setAbsence(
                  e.target.value as
                    | "VACATION"
                    | "SICK"
                    | "ACCIDENT"
                    | "FREE_REQUESTED"
                    | "UNPAID"
                    | "TZT"
                    | "PARENTAL_CARE"
                    | "MILITARY_SERVICE"
                    | "CIVIL_PROTECTION_SERVICE"
                    | "CIVIL_SERVICE"
                    | "HOLIDAY_AUTO",
                )
              }
              className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm"
            >
              {ABSENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
            {error}
          </p>
        ) : null}

        <DialogFooter className="sm:justify-between">
          <div>
            {initialEntry ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={handleDelete}
                className="text-rose-700 hover:bg-rose-50"
              >
                Eintrag entfernen
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={busy}>
                Abbrechen
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit} disabled={busy}>
              {pending ? "Speichern..." : "Speichern"}
            </Button>
          </div>
        </DialogFooter>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors " +
        (active
          ? "bg-white text-neutral-900 shadow-sm"
          : "text-neutral-600 hover:text-neutral-900")
      }
    >
      {children}
    </button>
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
      <HelpIconTooltip text={tooltip} contentClassName="max-w-72 normal-case" />
    </div>
  );
}
