import type { CSSProperties } from "react";
import { getShiftStyle, type ShiftKey } from "@/lib/shift-style";

export const DEFAULT_SERVICE_BLOCK_HEX = "#6366F1";

/** Vorschläge für die Dienstvorlage (Planungs-Blöcke) */
export const SERVICE_BLOCK_PRESET_HEX = [
  "#0EA5E9",
  "#6366F1",
  "#14B8A6",
  "#22C55E",
  "#EAB308",
  "#F97316",
  "#EC4899",
  "#78716C",
] as const;

const HEX_RE = /^#([0-9a-f]{6})$/i;

/** Normalisiert z. B. auf Großbuchstaben; ungültig → null */
export function parseBlockColorHex(
  raw: string | null | undefined,
): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const m = HEX_RE.exec(raw.trim());
  return m ? `#${m[1]!.toUpperCase()}` : null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: Number.parseInt(m[1]!, 16),
    g: Number.parseInt(m[2]!, 16),
    b: Number.parseInt(m[3]!, 16),
  };
}

/** Pastell-Hintergrund aus Vorlagenfarbe; Schrift immer dunkel (Lesbarkeit). */
export function blockStyleFromHex(hex: string): CSSProperties {
  const rgb = hexToRgb(hex);
  if (!rgb) return {};
  const { r, g, b } = rgb;
  return {
    backgroundColor: `rgba(${r},${g},${b},0.22)`,
    color: "#0a0a0a",
    borderColor: `rgba(${r},${g},${b},0.5)`,
    borderWidth: 1,
    borderStyle: "solid",
  };
}

/** Block-Klassen/Styles für Raster & Mobile (PlanEntryView). */
export function planEntryBlockAppearance(entry: {
  shiftKey: ShiftKey;
  serviceBlockColorHex: string | null;
}): { className: string; style?: CSSProperties } {
  const hex = parseBlockColorHex(entry.serviceBlockColorHex);
  if (hex) {
    return {
      className:
        "transition-[filter] hover:brightness-[0.97] active:brightness-95",
      style: blockStyleFromHex(hex),
    };
  }
  return { className: getShiftStyle(entry.shiftKey).block };
}

/** Mitarbeiter-Ansicht: Rand + Punkt + Block */
export function employeeDayBlockAppearance(opts: {
  shiftKey: ShiftKey;
  serviceBlockColorHex: string | null;
}): {
  block: { className: string; style?: CSSProperties };
  border: { className: string; style?: CSSProperties };
  dot: { className: string; style?: CSSProperties };
} {
  const hex = parseBlockColorHex(opts.serviceBlockColorHex);
  if (hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      const s = getShiftStyle(opts.shiftKey);
      return {
        block: { className: s.block },
        border: { className: s.border },
        dot: { className: s.dot },
      };
    }
    const { r, g, b } = rgb;
    return {
      block: {
        className:
          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium transition-[filter] hover:brightness-[0.97]",
        style: blockStyleFromHex(hex),
      },
      border: {
        className: "border",
        style: { borderColor: `rgba(${r},${g},${b},0.45)` },
      },
      dot: {
        className: "h-2.5 w-2.5 shrink-0 rounded-full",
        style: { backgroundColor: `rgb(${r},${g},${b})` },
      },
    };
  }
  const s = getShiftStyle(opts.shiftKey);
  return {
    block: { className: s.block },
    border: { className: s.border },
    dot: { className: s.dot },
  };
}
