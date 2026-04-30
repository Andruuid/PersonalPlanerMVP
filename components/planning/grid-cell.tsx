"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { planEntryBlockAppearance } from "@/lib/planning/block-appearance";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatSignedContributionHours,
  freeRequestedZeitsaldoTooltip,
} from "@/lib/time/contribution-display";
import type { PlanEntryView } from "./types";

interface GridCellProps {
  employeeId: string;
  isoDate: string;
  entry: PlanEntryView | null;
  selected: boolean;
  locked: boolean;
  displayContributionMinutes: number;
  weekYear: number;
  weekNumber: number;
  onSelect: () => void;
  onOpenAssign: () => void;
}

export function GridCell({
  employeeId,
  isoDate,
  entry,
  selected,
  locked,
  displayContributionMinutes,
  weekYear,
  weekNumber,
  onSelect,
  onOpenAssign,
}: GridCellProps) {
  const cellId = `cell::${employeeId}::${isoDate}`;
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: cellId,
    disabled: locked,
    data: { type: "cell", employeeId, isoDate },
  });

  return (
    <div
      ref={setDroppableRef}
      className={cn(
        "relative flex min-h-[64px] items-center justify-center rounded-xl border bg-white p-2 transition-all",
        selected
          ? "border-2 border-neutral-900 shadow-sm"
          : "border border-neutral-200",
        isOver && !locked
          ? "ring-2 ring-neutral-900/30 bg-neutral-50"
          : null,
        locked ? "opacity-60" : null,
      )}
    >
      {entry ? (
        <DraggableBlock
          entry={entry}
          locked={locked}
          displayContributionMinutes={displayContributionMinutes}
          weekYear={weekYear}
          weekNumber={weekNumber}
          onSelect={onSelect}
          onOpenAssign={onOpenAssign}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            onSelect();
            if (!locked) onOpenAssign();
          }}
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed px-1.5 text-center text-xs font-medium leading-snug",
            selected
              ? "border-neutral-400 text-neutral-700"
              : "border-neutral-300 text-neutral-500",
            !locked ? "hover:bg-neutral-50" : null,
          )}
          disabled={locked}
          aria-label="Eintrag hinzufügen"
        >
          <span>Auswählen</span>
          <span className="font-normal tabular-nums text-[10px] text-neutral-500">
            {formatSignedContributionHours(displayContributionMinutes)}
          </span>
        </button>
      )}
    </div>
  );
}

interface DraggableBlockProps {
  entry: PlanEntryView;
  locked: boolean;
  displayContributionMinutes: number;
  weekYear: number;
  weekNumber: number;
  onSelect: () => void;
  onOpenAssign: () => void;
}

function DraggableBlock({
  entry,
  locked,
  displayContributionMinutes,
  weekYear,
  weekNumber,
  onSelect,
  onOpenAssign,
}: DraggableBlockProps) {
  const block = planEntryBlockAppearance(entry);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `entry::${entry.id}`,
      data: { type: "entry", entryId: entry.id },
      disabled: locked,
    });

  const transformStyle = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  const isFreeRequested =
    entry.kind === "ABSENCE" && entry.absenceType === "FREE_REQUESTED";
  const contribLabel =
    formatSignedContributionHours(displayContributionMinutes);
  const freeTooltip = freeRequestedZeitsaldoTooltip(weekYear, weekNumber);

  const contributionLine = isFreeRequested ? (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span
          className="max-w-full truncate font-normal tabular-nums text-[10px] text-neutral-700 underline decoration-dotted decoration-neutral-400 underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {contribLabel}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-xs text-left text-sm leading-snug"
      >
        {freeTooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    <span className="max-w-full truncate font-normal tabular-nums text-[10px] text-neutral-700">
      {contribLabel}
    </span>
  );

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ ...transformStyle, ...block.style }}
      onClick={(e) => {
        if (e.detail === 2) {
          onOpenAssign();
        } else {
          onSelect();
        }
      }}
      onDoubleClick={() => onOpenAssign()}
      title={entry.subtitle ?? entry.title}
      className={cn(
        "inline-flex w-full max-w-[140px] flex-col items-center gap-0.5 rounded-full px-3 py-1.5 text-xs font-medium",
        block.className,
        locked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        isDragging ? "opacity-60" : null,
      )}
      {...listeners}
      {...attributes}
    >
      <span className="truncate">{entry.title}</span>
      {contributionLine}
    </button>
  );
}
