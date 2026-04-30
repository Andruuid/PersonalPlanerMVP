import type { AccountType, AccountUnit } from "@/lib/generated/prisma/enums";

export interface AccountDisplayConfig {
  label: string;
  unitLabel: string;
}

export const ACCOUNT_DISPLAY: Record<AccountType, AccountDisplayConfig> = {
  ZEITSALDO: { label: "Zeitsaldo", unitLabel: "Stunden" },
  FERIEN: { label: "Ferien", unitLabel: "Tage" },
  UEZ: { label: "UEZ", unitLabel: "Stunden" },
  TZT: { label: "TZT", unitLabel: "Tage" },
  SONNTAG_FEIERTAG_KOMPENSATION: {
    label: "So./Feiertag-Kompensation",
    unitLabel: "Stunden",
  },
  PARENTAL_CARE: {
    label: "Eltern-/Betreuungsurlaub",
    unitLabel: "Tage",
  },
};

export function formatMinutesAsHours(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "−";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDays(days: number, suffix: "Tage" | "Tag" = "Tage"): string {
  const rounded = Math.round(days * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const abs = Math.abs(rounded);
  return `${sign}${abs.toFixed(1)} ${suffix}`;
}

function formatHoursCompact(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours.toFixed(1)} h`;
}

export function formatFerienMinutes(
  minutes: number,
  baseDailyMinutes: number,
): string {
  if (baseDailyMinutes <= 0) return formatMinutesAsHours(minutes);
  const days = minutes / baseDailyMinutes;
  return `${formatDays(days)} (${formatHoursCompact(minutes)})`;
}

export function formatAccountValue(
  unit: AccountUnit,
  value: number,
  opts?: { accountType?: AccountType; baseDailyMinutes?: number },
): string {
  if (opts?.accountType === "FERIEN" && opts.baseDailyMinutes) {
    return formatFerienMinutes(value, opts.baseDailyMinutes);
  }
  if (unit === "MINUTES") return formatMinutesAsHours(value);
  return formatDays(value);
}
