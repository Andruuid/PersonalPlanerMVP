import { cn } from "@/lib/utils";
import type { KpiSummary } from "./types";

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

/**
 * Wochenplanung KPI-Leiste (Admin)
 *
 * Kern-KPI entsprechen dem Mockup und sind immer sichtbar.
 * Erweiterte KPI (Compliance, Sollbesetzung) nur bei Bedarf.
 *
 * UES-Ausweis ist bewusst nicht mehr hier — oft missverständlich; bei
 * Kundenwunsch wieder einblendbar (Summary-Feld + Aggregation in planning/page).
 */
export function KpiBar({ summary }: KpiBarProps) {
  const understaffed = summary.understaffedSlots > 0;
  const restIssues = summary.restViolationCount > 0;
  const streakKw = summary.consecutiveWorkStreakKwViolationCount > 0;
  const halfDayGap = summary.halfDayOffMissingEmployees > 0;

  const primaryItems: KpiItem[] = [
    { label: "Offene Anträge", value: summary.openRequests.toString() },
    { label: "Unbesetzte Felder", value: summary.unassignedCells.toString() },
    { label: "Mitarbeitende aktiv", value: summary.activeEmployees.toString() },
  ];

  const optionalItems: KpiItem[] = [];

  if (restIssues) {
    optionalItems.push({
      label: "Ruhezeit-Verstöße",
      value: summary.restViolationCount.toString(),
      hint: "Hinweise in den Mitarbeiterzeilen (tägl./wöchentl. Ruhezeit)",
      accent: "warn",
    });
  }

  if (streakKw) {
    optionalItems.push({
      label: "Arbeitstage > 6 Folge",
      value: summary.consecutiveWorkStreakKwViolationCount.toString(),
      hint: "Siebter Arbeitstag in Folge in dieser KW (alle MA zusammen)",
      accent: "warn",
    });
  }

  if (halfDayGap) {
    optionalItems.push({
      label: "Halbtag fehlt",
      value: summary.halfDayOffMissingEmployees.toString(),
      hint: "MA ohne angemerkten Halbtag trotz > 5 Arbeitstagen",
      accent: "warn",
    });
  }

  if (understaffed) {
    optionalItems.push({
      label: "Unterbesetzt",
      value: `${summary.understaffedSlots} Tage unterbesetzt`,
      hint: `Soll: ${summary.understaffedRequired}, Ist: ${summary.understaffedPlanned}`,
      accent: "warn",
      size: "sm",
    });
  }

  const statusItem: KpiItem = {
    label: "Status",
    value: summary.statusLabel,
    accent: "default",
    size: "md",
  };

  const items: KpiItem[] = [...primaryItems, ...optionalItems, statusItem];

  return (
    <div
      className={cn(
        "w-full gap-3",
        // Mobil: horizontal scroll bei vielen Karten; Desktop: gleich breite Spalten über volle Breite (wie Raster unten).
        "flex flex-nowrap overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "md:grid md:overflow-visible md:pb-0",
      )}
      style={{
        gridTemplateColumns:
          items.length > 0
            ? `repeat(${items.length}, minmax(0, 1fr))`
            : undefined,
      }}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className={cn(
            "shrink-0 rounded-2xl border bg-white p-4 shadow-sm md:min-w-0",
            "min-w-[10.5rem] max-w-[85vw] sm:max-w-none sm:min-w-[11rem] md:max-w-none",
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
