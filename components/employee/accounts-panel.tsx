import { Coins, PalmtreeIcon, TimerReset } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MyAccountValue, MyAccountsView } from "./types";

interface AccountsPanelProps {
  accounts: MyAccountsView;
}

interface AccountCardConfig {
  key: keyof MyAccountsView;
  label: string;
  icon: LucideIcon;
  iconClass: string;
  unitLabel: (value: MyAccountValue | null) => string;
}

function formatMinutesAsHours(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "−";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDays(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  return `${rounded.toFixed(1)} Tage`;
}

function formatTztDays(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  if (Math.abs(rounded) === 1) return `${rounded.toFixed(1)} Tag`;
  return `${rounded.toFixed(1)} Tage`;
}

const CARDS: AccountCardConfig[] = [
  {
    key: "zeitsaldo",
    label: "Zeitsaldo",
    icon: Coins,
    iconClass: "bg-emerald-100 text-emerald-700",
    unitLabel: (v) => (v ? formatMinutesAsHours(v.value) : "00:00"),
  },
  {
    key: "ferien",
    label: "Ferien",
    icon: PalmtreeIcon,
    iconClass: "bg-sky-100 text-sky-700",
    unitLabel: (v) => (v ? formatDays(v.value) : "0.0 Tage"),
  },
  {
    key: "tzt",
    label: "TZT",
    icon: TimerReset,
    iconClass: "bg-violet-100 text-violet-700",
    unitLabel: (v) => (v ? formatTztDays(v.value) : "0.0 Tage"),
  },
  {
    key: "parentalCare",
    label: "Eltern-/Betreuung",
    icon: PalmtreeIcon,
    iconClass: "bg-cyan-100 text-cyan-700",
    unitLabel: (v) => (v ? formatDays(v.value) : "0.0 Tage"),
  },
];

export function AccountsPanel({ accounts }: AccountsPanelProps) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <header className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          Meine Konten
        </h2>
        <p className="text-xs text-neutral-500">
          Saldo und Ferien-Rest weiterschreiben mit dem Wochenabschluss (nur
          veröffentlichte, dann abgeschlossene Wochen). Eintrag im Plan allein
          reicht dafür nicht.
        </p>
      </header>

      <ul className="space-y-2.5">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const value = accounts[card.key];
          return (
            <li
              key={card.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full",
                    card.iconClass,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {card.label}
                  </p>
                  <p className="text-sm font-semibold text-neutral-900 tabular-nums">
                    {card.unitLabel(value)}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
