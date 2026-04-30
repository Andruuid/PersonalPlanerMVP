"use client";

import { AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { planEntryBlockAppearance } from "@/lib/planning/block-appearance";
import {
  entryKey,
  type DayView,
  type EmployeeView,
  type EntryMap,
  type PlanEntryView,
} from "./types";
import { UNDERSTAFFED_DAY_DOT_TOOLTIP } from "./copy";

import {
  formatSignedContributionHours,
  freeRequestedZeitsaldoTooltip,
} from "@/lib/time/contribution-display";

interface WeekMobileViewProps {
  employees: EmployeeView[];
  days: DayView[];
  entries: EntryMap;
  selectedKey: string | null;
  locked: boolean;
  onOpenAssign: (employeeId: string, isoDate: string) => void;
  dailyZeitBalanceByEmployee: Record<string, Record<string, number>>;
  weekYear: number;
  weekNumber: number;
}

export function WeekMobileView({
  employees,
  days,
  entries,
  selectedKey,
  locked,
  onOpenAssign,
  dailyZeitBalanceByEmployee,
  weekYear,
  weekNumber,
}: WeekMobileViewProps) {
  if (employees.length === 0) {
    return (
      <div className="md:hidden rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
        Keine aktiven Mitarbeitenden. Lege unter «Mitarbeitende» mindestens eine:n
        Aktiven an, um die Wochenplanung zu nutzen.
      </div>
    );
  }

  const defaultDay = days[0]?.iso ?? "";

  return (
    <div className="md:hidden min-w-0 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
      <Tabs defaultValue={defaultDay} className="w-full min-w-0">
        <div className="overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList
            variant="line"
            className="inline-flex h-auto min-h-9 w-max flex-nowrap justify-start gap-1 bg-transparent p-0"
          >
            {days.map((d) => (
              <TabsTrigger
                key={d.iso}
                value={d.iso}
                className="shrink-0 flex-col gap-0.5 rounded-lg border border-transparent px-3 py-2 data-[state=active]:border-neutral-200 data-[state=active]:bg-neutral-50 data-[state=inactive]:text-neutral-500"
              >
                <span className="flex items-center justify-center gap-1 text-xs font-medium">
                  {d.weekdayLabel}
                  {d.understaffed ? (
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <span
                          tabIndex={0}
                          aria-label="Tag unterbesetzt"
                          className="inline-block h-2 w-2 shrink-0 cursor-help rounded-full bg-amber-500 align-middle outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1"
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        sideOffset={4}
                        className="max-w-xs text-left text-sm leading-snug"
                      >
                        {UNDERSTAFFED_DAY_DOT_TOOLTIP}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </span>
                <span className="text-[10px] font-normal text-neutral-400">
                  {d.shortDate}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {days.map((day) => (
          <TabsContent
            key={day.iso}
            value={day.iso}
            className="mt-0 min-w-0 space-y-3 pt-1 outline-none"
          >
            {employees.map((emp) => (
              <MobileEmployeeDayCard
                key={emp.id}
                employee={emp}
                dayIso={day.iso}
                entries={entries}
                selectedKey={selectedKey}
                locked={locked}
                onOpenAssign={onOpenAssign}
                displayContributionMinutes={
                  dailyZeitBalanceByEmployee[emp.id]?.[day.iso] ?? 0
                }
                weekYear={weekYear}
                weekNumber={weekNumber}
              />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface MobileEmployeeDayCardProps {
  employee: EmployeeView;
  dayIso: string;
  entries: EntryMap;
  selectedKey: string | null;
  locked: boolean;
  onOpenAssign: (employeeId: string, isoDate: string) => void;
  displayContributionMinutes: number;
  weekYear: number;
  weekNumber: number;
}

function MobileEmployeeDayCard({
  employee,
  dayIso,
  entries,
  selectedKey,
  locked,
  onOpenAssign,
  displayContributionMinutes,
  weekYear,
  weekNumber,
}: MobileEmployeeDayCardProps) {
  const key = entryKey(employee.id, dayIso);
  const entry: PlanEntryView | null = entries[key] ?? null;
  const selected = selectedKey === key;
  const block = entry ? planEntryBlockAppearance(entry) : null;
  const isFreeRequested =
    entry?.kind === "ABSENCE" && entry.absenceType === "FREE_REQUESTED";
  const contribLabel =
    formatSignedContributionHours(displayContributionMinutes);
  const freeTooltip = freeRequestedZeitsaldoTooltip(weekYear, weekNumber);

  const contributionFooter = entry && block ? (
    isFreeRequested ? (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <p
            className="mt-1 text-xs font-medium tabular-nums text-neutral-700 underline decoration-dotted decoration-neutral-400 underline-offset-2"
            onClick={(e) => e.stopPropagation()}
          >
            {contribLabel}
          </p>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs text-left text-sm leading-snug"
        >
          {freeTooltip}
        </TooltipContent>
      </Tooltip>
    ) : (
      <p className="mt-1 text-xs font-medium tabular-nums text-neutral-700">
        {contribLabel}
      </p>
    )
  ) : (
    <p className="mt-1 text-xs font-medium tabular-nums text-neutral-600">
      {contribLabel}
    </p>
  );

  return (
    <article className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3">
      <div className="mb-2 flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-neutral-900">
            {employee.firstName} {employee.lastName}
          </p>
          {employee.roleLabel ? (
            <p className="truncate text-xs text-neutral-500">
              {employee.roleLabel}
            </p>
          ) : null}
        </div>
        {employee.hasPlanningViolations ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Planungshinweis ArG anzeigen"
                className="mt-0.5 shrink-0 rounded p-0.5 text-amber-600 hover:bg-amber-50 hover:text-amber-800 focus-visible:outline focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <AlertTriangle className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-xs whitespace-pre-line text-left text-sm"
            >
              {employee.planningViolationTooltip ??
                "Arbeitszeit-/Ruhezeit-Hinweise (ArG)."}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {entry && block ? (
        <button
          type="button"
          onClick={() => onOpenAssign(employee.id, dayIso)}
          className={cn(
            "w-full rounded-xl border bg-white p-3 text-left transition-all",
            selected
              ? "border-2 border-neutral-900 shadow-sm"
              : "border-neutral-200",
            locked ? "opacity-60" : "active:bg-neutral-50",
          )}
        >
          <span
            className={cn(
              "inline-flex max-w-full flex-col rounded-full px-3 py-1.5 text-xs font-medium",
              block.className,
            )}
            style={block.style}
          >
            <span className="truncate">{entry.title}</span>
          </span>
          {entry.subtitle ? (
            <p className="mt-1.5 line-clamp-2 text-xs text-neutral-600">
              {entry.subtitle}
            </p>
          ) : null}
          {contributionFooter}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onOpenAssign(employee.id, dayIso)}
          className={cn(
            "flex min-h-[64px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-white px-2 py-2 text-center text-xs font-medium leading-snug transition-colors",
            selected
              ? "border-2 border-neutral-800 text-neutral-800 shadow-sm"
              : "border-neutral-300 text-neutral-500",
            !locked ? "hover:bg-neutral-50" : null,
            locked ? "opacity-60" : null,
          )}
        >
          <span>Eintrag hinzufügen</span>
          <span className="font-normal tabular-nums text-[10px] text-neutral-600">
            {formatSignedContributionHours(displayContributionMinutes)}
          </span>
        </button>
      )}
    </article>
  );
}
