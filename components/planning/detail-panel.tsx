"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getShiftStyle, type ShiftKey } from "@/lib/shift-style";
import type { QuickPickKey } from "@/lib/planning/plan-entry-schemas";
import {
  deletePlanEntryAction,
  quickSetPlanEntryAction,
} from "@/server/planning";
import type { PlanEntryView } from "./types";

interface DetailPanelProps {
  weekId: string;
  selectedKey: string | null;
  selectedEmployeeName: string | null;
  selectedEmployeeId: string | null;
  selectedDateLabel: string | null;
  selectedIsoDate: string | null;
  entry: PlanEntryView | null;
  locked: boolean;
}

const SHIFT_PICKS: Array<{ key: QuickPickKey; shiftKey: ShiftKey; label: string }> = [
  { key: "FRUEH", shiftKey: "FRUEH", label: "Frühdienst" },
  { key: "SPAET", shiftKey: "SPAET", label: "Spätdienst" },
  { key: "VACATION", shiftKey: "FERIEN", label: "Ferien" },
  { key: "FREE_REQUESTED", shiftKey: "FREI_VERLANGT", label: "Frei verlangt" },
  { key: "TZT", shiftKey: "TZT", label: "TZT" },
  { key: "SAMSTAG", shiftKey: "SAMSTAG", label: "Samstagsdienst" },
];

export function DetailPanel({
  weekId,
  selectedKey,
  selectedEmployeeName,
  selectedEmployeeId,
  selectedDateLabel,
  selectedIsoDate,
  entry,
  locked,
}: DetailPanelProps) {
  const [pending, startTransition] = useTransition();

  function quickSet(pick: QuickPickKey) {
    if (!selectedEmployeeId || !selectedIsoDate) return;
    startTransition(async () => {
      const result = await quickSetPlanEntryAction(
        weekId,
        selectedEmployeeId,
        selectedIsoDate,
        pick,
      );
      if (result.ok) {
        toast.success("Eintrag aktualisiert.");
      } else {
        toast.error(result.error);
      }
    });
  }

  function clearCell() {
    if (!selectedEmployeeId || !selectedIsoDate) return;
    startTransition(async () => {
      const result = await deletePlanEntryAction(
        weekId,
        selectedEmployeeId,
        selectedIsoDate,
      );
      if (result.ok) {
        toast.success("Eintrag entfernt.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="app-label-caps text-sm font-semibold text-neutral-700">
          Detailfenster
        </h2>
      </header>

      {!selectedKey ? (
        <p className="text-sm text-neutral-500">
          Wähle eine Zelle in der Wochenplanung, um Details und Schnellaktionen
          zu sehen.
        </p>
      ) : (
        <div className="space-y-4">
          <DetailRow label="Ausgewählter Tag" value={selectedDateLabel ?? "—"} />
          <DetailRow
            label="Mitarbeitender"
            value={selectedEmployeeName ?? "—"}
          />
          <DetailRow
            label="Aktueller Eintrag"
            value={entry ? entry.title : "—"}
            valueChip={entry?.shiftKey ?? null}
            subtitle={entry?.subtitle ?? null}
          />

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Schnell ändern
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SHIFT_PICKS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  disabled={locked || pending}
                  onClick={() => quickSet(p.key)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-medium",
                    getShiftStyle(p.shiftKey).chip,
                    locked || pending ? "opacity-60" : null,
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              disabled={locked || pending || !entry}
              onClick={clearCell}
            >
              Leeren
            </Button>
          </div>

          {locked ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              Diese Woche ist abgeschlossen — Bearbeiten nicht möglich.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  valueChip?: ShiftKey | null;
  subtitle?: string | null;
}

function DetailRow({ label, value, valueChip, subtitle }: DetailRowProps) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        {valueChip ? (
          <span
            className={cn(
              "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
              getShiftStyle(valueChip).chip,
            )}
          >
            {value}
          </span>
        ) : (
          <p className="font-medium text-neutral-900">{value}</p>
        )}
      </div>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-neutral-500">{subtitle}</p>
      ) : null}
    </div>
  );
}
