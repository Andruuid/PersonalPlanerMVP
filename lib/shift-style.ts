export type ShiftKey =
  | "FRUEH"
  | "SPAET"
  | "SAMSTAG"
  | "FERIEN"
  | "FREI_VERLANGT"
  | "TZT"
  | "KRANK"
  | "FEIERTAG"
  | "FREI"
  | "EMPTY";

export interface ShiftStyle {
  label: string;
  chip: string;
  badge: string;
  border: string;
  dot: string;
}

export const SHIFT_STYLES: Record<ShiftKey, ShiftStyle> = {
  FRUEH: {
    label: "Frühdienst",
    chip: "bg-sky-50 text-sky-900 ring-1 ring-sky-200 hover:bg-sky-100",
    badge: "bg-sky-100 text-sky-900",
    border: "border-sky-300",
    dot: "bg-sky-500",
  },
  SPAET: {
    label: "Spätdienst",
    chip:
      "bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200 hover:bg-indigo-100",
    badge: "bg-indigo-100 text-indigo-900",
    border: "border-indigo-300",
    dot: "bg-indigo-500",
  },
  SAMSTAG: {
    label: "Samstagsdienst",
    chip:
      "bg-teal-50 text-teal-900 ring-1 ring-teal-200 hover:bg-teal-100",
    badge: "bg-teal-100 text-teal-900",
    border: "border-teal-300",
    dot: "bg-teal-500",
  },
  FERIEN: {
    label: "Ferien",
    chip:
      "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100",
    badge: "bg-emerald-100 text-emerald-900",
    border: "border-emerald-300",
    dot: "bg-emerald-500",
  },
  FREI_VERLANGT: {
    label: "Frei verlangt",
    chip:
      "bg-amber-50 text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100",
    badge: "bg-amber-100 text-amber-900",
    border: "border-amber-300",
    dot: "bg-amber-500",
  },
  TZT: {
    label: "TZT",
    chip:
      "bg-violet-50 text-violet-900 ring-1 ring-violet-200 hover:bg-violet-100",
    badge: "bg-violet-100 text-violet-900",
    border: "border-violet-300",
    dot: "bg-violet-500",
  },
  KRANK: {
    label: "Krank",
    chip:
      "bg-rose-50 text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100",
    badge: "bg-rose-100 text-rose-900",
    border: "border-rose-300",
    dot: "bg-rose-500",
  },
  FEIERTAG: {
    label: "Feiertag",
    chip:
      "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
    badge: "bg-slate-200 text-slate-800",
    border: "border-slate-300",
    dot: "bg-slate-500",
  },
  FREI: {
    label: "Frei",
    chip:
      "bg-neutral-50 text-neutral-500 ring-1 ring-neutral-200",
    badge: "bg-neutral-100 text-neutral-700",
    border: "border-neutral-200",
    dot: "bg-neutral-400",
  },
  EMPTY: {
    label: "Ziehen oder auswählen",
    chip:
      "border border-dashed border-neutral-300 text-neutral-500 bg-white hover:bg-neutral-50",
    badge: "bg-neutral-50 text-neutral-500",
    border: "border-neutral-300",
    dot: "bg-neutral-300",
  },
};

export function getShiftStyle(key: ShiftKey): ShiftStyle {
  return SHIFT_STYLES[key];
}

const SERVICE_CODE_TO_SHIFT: Record<string, ShiftKey> = {
  FRUEH: "FRUEH",
  SPAET: "SPAET",
  SAMSTAG: "SAMSTAG",
};

export function shiftKeyForServiceCode(code: string | undefined): ShiftKey {
  if (!code) return "EMPTY";
  return SERVICE_CODE_TO_SHIFT[code] ?? "EMPTY";
}

const ABSENCE_TO_SHIFT: Record<string, ShiftKey> = {
  VACATION: "FERIEN",
  SICK: "KRANK",
  ACCIDENT: "KRANK",
  PARENTAL_CARE: "FERIEN",
  MILITARY_SERVICE: "FREI_VERLANGT",
  CIVIL_PROTECTION_SERVICE: "FREI_VERLANGT",
  CIVIL_SERVICE: "FREI_VERLANGT",
  FREE_REQUESTED: "FREI_VERLANGT",
  UNPAID: "FREI",
  TZT: "TZT",
  HOLIDAY_AUTO: "FEIERTAG",
};

export function shiftKeyForAbsence(absenceType: string | undefined): ShiftKey {
  if (!absenceType) return "EMPTY";
  return ABSENCE_TO_SHIFT[absenceType] ?? "EMPTY";
}
