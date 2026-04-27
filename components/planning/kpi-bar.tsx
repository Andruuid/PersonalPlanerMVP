import { cn } from "@/lib/utils";
import type { KpiSummary } from "./types";
import { formatMinutesAsHours } from "@/components/admin/accounts/format";

interface KpiBarProps {
  summary: KpiSummary;
}

export function KpiBar({ summary }: KpiBarProps) {
  const items = [
    { label: "Offene Anträge", value: summary.openRequests.toString() },
    { label: "Unbesetzte Felder", value: summary.unassignedCells.toString() },
    { label: "Mitarbeitende aktiv", value: summary.activeEmployees.toString() },
    { label: "UES-Ausweis", value: formatMinutesAsHours(summary.uesAusweisMinutes) },
    { label: "Status", value: summary.statusLabel, accent: true },
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
        >
          <p className="app-label-caps text-xs text-neutral-500">{it.label}</p>
          <p
            className={cn(
              "mt-1 truncate font-semibold text-neutral-900",
              "accent" in it && it.accent ? "text-2xl" : "text-3xl",
            )}
          >
            {it.value}
          </p>
        </div>
      ))}
    </div>
  );
}
