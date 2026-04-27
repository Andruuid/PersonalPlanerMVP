"use client";

import { useState } from "react";
import { Plus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { HelpIconTooltip } from "@/components/ui/help-icon-tooltip";
import {
  ManualBookingForm,
  type EmployeePickOption,
  type ManualBookingFormDefaults,
} from "./manual-booking-form";
import {
  ACCOUNT_DISPLAY,
  formatAccountValue,
} from "./format";
import type { AccountSummary, AdminAccountsRow } from "@/server/accounts";
import type { AccountType } from "@/lib/generated/prisma/enums";

interface Props {
  rows: AdminAccountsRow[];
  year: number;
  todayIso: string;
}

const ACCOUNT_ORDER: AccountType[] = [
  "ZEITSALDO",
  "FERIEN",
  "UEZ",
  "TZT",
  "SONNTAG_FEIERTAG_KOMPENSATION",
];

type DialogState =
  | { mode: "closed" }
  | { mode: "manual-booking"; preset: Partial<ManualBookingFormDefaults> };

export function AccountsTable({ rows, year, todayIso }: Props) {
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const close = () => setDialog({ mode: "closed" });

  const employees: EmployeePickOption[] = rows.map((r) => ({
    id: r.employeeId,
    label: `${r.firstName} ${r.lastName}${r.roleLabel ? ` · ${r.roleLabel}` : ""}`,
  }));

  function openBooking(
    preset: Partial<ManualBookingFormDefaults> = {},
  ) {
    setDialog({ mode: "manual-booking", preset });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {rows.filter((r) => r.isActive).length} aktive Mitarbeitende ·
          Anzeige für Jahr {year}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openBooking()}>
            <Plus className="mr-1 h-4 w-4" />
            Manuelle Buchung
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Mitarbeitende:r</th>
                {ACCOUNT_ORDER.map((accountType) => (
                  <th key={accountType} className="px-4 py-3">
                    <HeaderWithHelp
                      label={ACCOUNT_DISPLAY[accountType].label}
                      tooltip={`Aktueller Kontostand und Eröffnungswert für ${ACCOUNT_DISPLAY[accountType].label}.`}
                    />
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={ACCOUNT_ORDER.length + 2}
                    className="px-4 py-10 text-center text-sm text-neutral-500"
                  >
                    Noch keine Mitarbeitenden angelegt.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr
                  key={row.employeeId}
                  className="align-top hover:bg-neutral-50/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-neutral-900">
                        {row.firstName} {row.lastName}
                      </div>
                      {!row.isActive ? (
                        <Badge variant="secondary">Inaktiv</Badge>
                      ) : null}
                    </div>
                    {row.roleLabel ? (
                      <div className="text-xs text-neutral-500">
                        {row.roleLabel}
                      </div>
                    ) : null}
                  </td>
                  {ACCOUNT_ORDER.map((accountType) => {
                    const account = row.accounts[accountType];
                    return (
                      <td key={accountType} className="px-4 py-3">
                        <AccountCell account={account} />
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openBooking({
                            employeeId: row.employeeId,
                            date: todayIso,
                            accountType: "ZEITSALDO",
                            bookingType: "MANUAL_CREDIT",
                          })
                        }
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Buchung
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <a
                          href={`/my-accounts?employee=${row.employeeId}&year=${year}`}
                        >
                          <History className="mr-1 h-3.5 w-3.5" />
                          Historie
                        </a>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={dialog.mode !== "closed"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent className="sm:max-w-2xl">
          {dialog.mode === "manual-booking" ? (
            <ManualBookingForm
              employees={employees}
              defaults={{
                employeeId: dialog.preset.employeeId ?? "",
                accountType: dialog.preset.accountType ?? "ZEITSALDO",
                date: dialog.preset.date ?? todayIso,
                bookingType:
                  dialog.preset.bookingType ?? "MANUAL_CREDIT",
                comment: dialog.preset.comment,
              }}
              onSuccess={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function HeaderWithHelp({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <HelpIconTooltip
        text={tooltip}
        ariaLabel="Spaltenhilfe anzeigen"
        contentClassName="max-w-72 normal-case"
      />
    </span>
  );
}

function AccountCell({ account }: { account: AccountSummary }) {
  const positive = account.currentValue > 0;
  const negative = account.currentValue < 0;
  return (
    <div className="space-y-0.5">
      <div
        className={
          "text-base font-semibold tabular-nums " +
          (positive
            ? "text-emerald-700"
            : negative
              ? "text-rose-700"
              : "text-neutral-900")
        }
      >
        {formatAccountValue(account.unit, account.currentValue)}
      </div>
      <div className="text-xs text-neutral-500">
        Eröffnung {formatAccountValue(account.unit, account.openingValue)}
      </div>
    </div>
  );
}
