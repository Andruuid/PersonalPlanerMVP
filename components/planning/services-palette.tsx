"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import {
  getShiftStyle,
  shiftKeyForServiceCode,
  type ShiftKey,
} from "@/lib/shift-style";
import type { ServiceOption } from "./types";

export type PaletteAbsenceKey =
  | "VACATION"
  | "FREE_REQUESTED"
  | "TZT"
  | "SICK";

export interface PaletteAbsence {
  key: PaletteAbsenceKey;
  label: string;
  shiftKey: ShiftKey;
}

export const PALETTE_ABSENCES: PaletteAbsence[] = [
  { key: "VACATION", label: "Ferien", shiftKey: "FERIEN" },
  { key: "FREE_REQUESTED", label: "Frei verlangt", shiftKey: "FREI_VERLANGT" },
  { key: "TZT", label: "TZT", shiftKey: "TZT" },
  { key: "SICK", label: "Krank", shiftKey: "KRANK" },
];

interface ServicesPaletteProps {
  services: ServiceOption[];
  locked: boolean;
}

export function ServicesPalette({ services, locked }: ServicesPaletteProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Bausteine ziehen
        </p>
        <p className="text-[11px] text-neutral-500">
          In eine Zelle ziehen oder Zelle anklicken
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {services.map((s) => (
          <PaletteChip
            key={`svc-${s.id}`}
            id={`palette-service::${s.id}`}
            data={{ type: "palette-service", serviceId: s.id }}
            shiftKey={shiftKeyForServiceCode(s.code)}
            label={s.name}
            disabled={locked}
          />
        ))}
        {PALETTE_ABSENCES.map((a) => (
          <PaletteChip
            key={`abs-${a.key}`}
            id={`palette-absence::${a.key}`}
            data={{ type: "palette-absence", absenceType: a.key }}
            shiftKey={a.shiftKey}
            label={a.label}
            disabled={locked}
          />
        ))}
      </div>
    </div>
  );
}

interface PaletteChipProps {
  id: string;
  data: Record<string, unknown>;
  shiftKey: ShiftKey;
  label: string;
  disabled: boolean;
}

function PaletteChip({ id, data, shiftKey, label, disabled }: PaletteChipProps) {
  const style = getShiftStyle(shiftKey);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id, data, disabled });

  const transformStyle = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={transformStyle}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium",
        style.chip,
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab active:cursor-grabbing",
        isDragging ? "opacity-60" : null,
      )}
      disabled={disabled}
      {...listeners}
      {...attributes}
    >
      {label}
    </button>
  );
}
