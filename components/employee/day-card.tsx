import { cn } from "@/lib/utils";
import { getShiftStyle } from "@/lib/shift-style";
import type { MyDayView } from "./types";

interface DayCardProps {
  day: MyDayView;
}

export function DayCard({ day }: DayCardProps) {
  const style = getShiftStyle(day.shiftKey);
  const isEmpty = day.shiftKey === "EMPTY" || day.shiftKey === "FREI";

  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between md:gap-6",
        isEmpty ? "border-neutral-200" : style.border,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", style.dot)}
          aria-hidden
        />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {day.longDate}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                style.chip,
              )}
            >
              {day.title}
            </span>
            {day.holidayName ? (
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
                Feiertag · {day.holidayName}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start md:items-end">
        <p
          className={cn(
            "text-base font-semibold tabular-nums",
            isEmpty ? "text-neutral-400" : "text-neutral-900",
          )}
        >
          {day.timeRange ?? "—"}
        </p>
        {day.subtitle ? (
          <p className="text-xs text-neutral-500">{day.subtitle}</p>
        ) : null}
      </div>
    </article>
  );
}
