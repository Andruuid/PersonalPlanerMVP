import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import {
  ACCOUNT_DISPLAY,
  formatAccountValue,
} from "@/components/admin/accounts/format";
import type { BookingHistoryRow } from "@/server/accounts";
import type { BookingType } from "@/lib/generated/prisma/enums";

const BOOKING_TYPE_LABEL: Record<BookingType, string> = {
  OPENING: "Eröffnung",
  AUTO_WEEKLY: "Wochenabschluss",
  FREE_REQUESTED: "Freiwunsch",
  MANUAL_CREDIT: "Gutschrift",
  MANUAL_DEBIT: "Belastung",
  CORRECTION: "Korrektur",
  CARRYOVER: "Vortrag",
};

const BOOKING_TYPE_BADGE: Record<BookingType, string> = {
  OPENING: "bg-neutral-100 text-neutral-700",
  AUTO_WEEKLY: "bg-neutral-100 text-neutral-700",
  FREE_REQUESTED: "bg-violet-100 text-violet-800",
  MANUAL_CREDIT: "bg-emerald-100 text-emerald-800",
  MANUAL_DEBIT: "bg-rose-100 text-rose-800",
  CORRECTION: "bg-amber-100 text-amber-800",
  CARRYOVER: "bg-sky-100 text-sky-800",
};

interface MonthGroup {
  monthIso: string;
  monthLabel: string;
  rows: BookingHistoryRow[];
}

function groupByMonth(rows: BookingHistoryRow[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    let group = groups.get(key);
    if (!group) {
      group = {
        monthIso: key,
        monthLabel: format(parseISO(`${key}-01`), "LLLL yyyy", { locale: de }),
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push(r);
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.monthIso > b.monthIso ? -1 : 1,
  );
}

interface Props {
  rows: BookingHistoryRow[];
}

export function BookingHistory({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
        Noch keine Buchungen für dieses Jahr.
      </div>
    );
  }

  const groups = groupByMonth(rows);

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.monthIso} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
            {g.monthLabel}
          </h3>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <ul className="divide-y divide-neutral-100">
              {g.rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                >
                  <span className="w-20 shrink-0 text-sm font-medium text-neutral-700 tabular-nums">
                    {format(parseISO(r.date), "dd.MM.")}
                  </span>
                  <span className="w-24 shrink-0 text-sm text-neutral-700">
                    {ACCOUNT_DISPLAY[r.accountType].label}
                  </span>
                  <span
                    className={
                      "ml-auto w-24 shrink-0 text-right text-sm font-semibold tabular-nums " +
                      (r.value > 0
                        ? "text-emerald-700"
                        : r.value < 0
                          ? "text-rose-700"
                          : "text-neutral-900")
                    }
                  >
                    {formatAccountValue(r.unit, r.value)}
                  </span>
                  <Badge
                    className={`shrink-0 ${BOOKING_TYPE_BADGE[r.bookingType]}`}
                    variant="secondary"
                  >
                    {BOOKING_TYPE_LABEL[r.bookingType]}
                  </Badge>
                  {r.comment ? (
                    <p className="basis-full text-xs text-neutral-500">
                      {r.comment}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
