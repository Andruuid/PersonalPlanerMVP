import { cn } from "@/lib/utils";
import { employeeDayBlockAppearance } from "@/lib/planning/block-appearance";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatSignedContributionHours } from "@/lib/time/contribution-display";
import type { MyDayView } from "./types";

interface DayCardProps {
  day: MyDayView;
}

export function DayCard({ day }: DayCardProps) {
  const tone = employeeDayBlockAppearance({
    shiftKey: day.shiftKey,
    serviceBlockColorHex: day.serviceBlockColorHex ?? null,
  });
  const isEmpty = day.shiftKey === "EMPTY" || day.shiftKey === "FREI";

  const contributionRow =
    day.displayContributionMinutes !== null ? (
      day.freeRequestedZeitsaldoTooltip ? (
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <p
              className={cn(
                "mt-0.5 cursor-help text-xs font-medium tabular-nums text-neutral-700 underline decoration-dotted decoration-neutral-400 underline-offset-2",
              )}
            >
              {formatSignedContributionHours(day.displayContributionMinutes)}
            </p>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="max-w-xs text-left text-sm leading-snug"
          >
            {day.freeRequestedZeitsaldoTooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        <p className="mt-0.5 text-xs font-medium tabular-nums text-neutral-700">
          {formatSignedContributionHours(day.displayContributionMinutes)}
        </p>
      )
    ) : null;

  return (
    <article
      className={cn(
        "flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between md:gap-6",
        isEmpty ? "border-neutral-200" : tone.border.className,
      )}
      style={isEmpty ? undefined : tone.border.style}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", tone.dot.className)}
          style={tone.dot.style}
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
                tone.block.className,
              )}
              style={tone.block.style}
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
        {contributionRow}
        {day.subtitle ? (
          <p className="text-xs text-neutral-500">{day.subtitle}</p>
        ) : null}
      </div>
    </article>
  );
}
