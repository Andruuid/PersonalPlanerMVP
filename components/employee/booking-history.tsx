import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import {
  ACCOUNT_DISPLAY,
  formatAccountValue,
} from "@/components/admin/accounts/format";
import {
  BOOKING_TYPE_BADGE,
  BOOKING_TYPE_LABEL,
} from "@/components/shared/booking-type-copy";
import type { BookingHistoryRow } from "@/server/accounts";
import { cn } from "@/lib/utils";

/** Hide machine-only idempotency line from UI. */
function commentForDisplay(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw
    .split("\n")
    .filter((line) => !line.startsWith("COMPENSATION_EXPIRED_CASE:"))
    .join("\n")
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

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
  ferienBaseDailySollMinutes?: number;
}

export function BookingHistory({ rows, ferienBaseDailySollMinutes }: Props) {
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
              {g.rows.map((r) => {
                const commentShown = commentForDisplay(r.comment);
                return (
                <li
                  key={r.id}
                  className={cn(
                    "flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3",
                    r.bookingType === "COMPENSATION_EXPIRED" &&
                      "border-l-4 border-red-600 bg-red-50/90",
                  )}
                >
                  <span className="w-20 shrink-0 text-sm font-medium text-neutral-700 tabular-nums">
                    {format(parseISO(r.date), "dd.MM.")}
                  </span>
                  <span className="w-24 shrink-0 text-sm text-neutral-700">
                    {ACCOUNT_DISPLAY[r.accountType].label}
                  </span>
                  <span
                    className={cn(
                      "ml-auto w-24 shrink-0 text-right text-sm font-semibold tabular-nums",
                      r.bookingType === "COMPENSATION_EXPIRED"
                        ? "text-red-800"
                        : r.value > 0
                          ? "text-emerald-700"
                          : r.value < 0
                            ? "text-rose-700"
                            : "text-neutral-900",
                    )}
                  >
                    {formatAccountValue(r.unit, r.value, {
                      accountType: r.accountType,
                      baseDailyMinutes: ferienBaseDailySollMinutes,
                    })}
                  </span>
                  <Badge
                    className={`shrink-0 ${BOOKING_TYPE_BADGE[r.bookingType]}`}
                    variant="secondary"
                  >
                    {BOOKING_TYPE_LABEL[r.bookingType]}
                  </Badge>
                  {commentShown ? (
                    <p className="basis-full text-xs text-neutral-500">{commentShown}</p>
                  ) : null}
                </li>
                );
              })}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
