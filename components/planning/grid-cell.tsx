"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { getShiftStyle } from "@/lib/shift-style";
import type { PlanEntryView } from "./types";

interface GridCellProps {
  employeeId: string;
  isoDate: string;
  entry: PlanEntryView | null;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  onOpenAssign: () => void;
}

export function GridCell({
  employeeId,
  isoDate,
  entry,
  selected,
  locked,
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
        <DraggableChip
          entry={entry}
          locked={locked}
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
            "flex h-full w-full items-center justify-center rounded-lg border border-dashed px-1.5 text-center text-xs font-medium leading-snug",
            selected
              ? "border-neutral-400 text-neutral-700"
              : "border-neutral-300 text-neutral-500",
            !locked ? "hover:bg-neutral-50" : null,
          )}
          disabled={locked}
          aria-label="Eintrag hinzufügen"
        >
          Auswählen
        </button>
      )}
    </div>
  );
}

interface DraggableChipProps {
  entry: PlanEntryView;
  locked: boolean;
  onSelect: () => void;
  onOpenAssign: () => void;
}

function DraggableChip({
  entry,
  locked,
  onSelect,
  onOpenAssign,
}: DraggableChipProps) {
  const style = getShiftStyle(entry.shiftKey);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `entry::${entry.id}`,
      data: { type: "entry", entryId: entry.id },
      disabled: locked,
    });

  const transformStyle = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={transformStyle}
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
        "inline-flex w-full max-w-[140px] flex-col items-center rounded-full px-3 py-1.5 text-xs font-medium",
        style.chip,
        locked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        isDragging ? "opacity-60" : null,
      )}
      {...listeners}
      {...attributes}
    >
      <span className="truncate">{entry.title}</span>
    </button>
  );
}
