import { cn } from "@/lib/utils";
import type { KpiSummary } from "./types";
import { formatMinutesAsHours } from "@/components/admin/accounts/format";

interface KpiBarProps {
  summary: KpiSummary;
}

interface KpiItem {
  label: string;
  value: string;
  hint?: string;
  accent?: "default" | "warn";
  size?: "sm" | "md" | "lg";
}

export function KpiBar({ summary }: KpiBarProps) {
  const understaffed = summary.understaffedSlots > 0;
  const items: KpiItem[] = [
    { label: "Offene Anträge", value: summary.openRequests.toString() },
    { label: "Unbesetzte Felder", value: summary.unassignedCells.toString() },
    { label: "Mitarbeitende aktiv", value: summary.activeEmployees.toString() },
    {
      label: "UES-Ausweis",
      value: formatMinutesAsHours(summary.uesAusweisMinutes),
    },
    {
      label: "Unterbesetzt",
      value: understaffed
        ? `${summary.understaffedSlots} Tage unterbesetzt`
        : "Keine",
      hint: understaffed
        ? `Soll: ${summary.understaffedRequired}, Ist: ${summary.understaffedPlanned}`
        : "Alle Sollvorgaben erfüllt",
      accent: understaffed ? "warn" : "default",
      size: "sm",
    },
    {
      label: "Status",
      value: summary.statusLabel,
      accent: "default",
      size: "md",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {items.map((it) => (
        <div
          key={it.label}
          className={cn(
            "rounded-2xl border bg-white p-4 shadow-sm",
            it.accent === "warn"
              ? "border-amber-300 bg-amber-50"
              : "border-neutral-200",
          )}
        >
          <p className="app-label-caps text-xs text-neutral-500">{it.label}</p>
          <p
            className={cn(
              "mt-1 truncate font-semibold",
              it.accent === "warn" ? "text-amber-900" : "text-neutral-900",
              it.size === "sm"
                ? "text-xl"
                : it.size === "md"
                  ? "text-2xl"
                  : "text-3xl",
            )}
          >
            {it.value}
          </p>
          {it.hint ? (
            <p
              className={cn(
                "mt-0.5 truncate text-xs",
                it.accent === "warn" ? "text-amber-800" : "text-neutral-500",
              )}
            >
              {it.hint}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
