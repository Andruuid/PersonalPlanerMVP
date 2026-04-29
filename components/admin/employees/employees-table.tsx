"use client";

import { useState, useTransition } from "react";
import { Lock, LockOpen, Pencil, Plus, UserCheck, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmployeeForm,
  type EmployeeFormDefaults,
  type LocationOption,
  type TztModelValue,
} from "./employee-form";
import { setEmployeeActiveAction, setUserLockAction } from "@/server/employees";
import { isoDateString } from "@/lib/time/week";
import {
  parseExitSnapshotJson,
  type ExitSnapshotData,
} from "@/lib/employee/exit-snapshot";

export interface EmployeeRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleLabel: string | null;
  pensum: number;
  entryDate: string;
  exitDate: string | null;
  locationId: string;
  locationName: string;
  vacationDaysPerYear: number;
  weeklyTargetMinutes: number;
  hazMinutesPerWeek: number;
  tztModel: TztModelValue;
  /** null = Tenant-Standard */
  standardWorkDays: number | null;
  isActive: boolean;
  userIsActive: boolean;
  /** Kontenabschluss-Snapshot nach gesetztem Austritt (Vergangenheit). */
  exitSnapshot?: {
    exitDate: string;
    snapshotJson: string;
  } | null;
}

interface Props {
  employees: EmployeeRow[];
  locations: LocationOption[];
  defaultLocationId: string;
}

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; employee: EmployeeRow };

export function EmployeesTable({
  employees,
  locations,
  defaultLocationId,
}: Props) {
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [snapshotPanel, setSnapshotPanel] = useState<
    | { mode: "closed" }
    | { mode: "open"; employeeLabel: string; exitSnapshot: NonNullable<EmployeeRow["exitSnapshot"]> }
  >({ mode: "closed" });
  const [pendingId, startTransition] = usePendingId();

  const close = () => setDialog({ mode: "closed" });

  function toggleActive(employee: EmployeeRow) {
    startTransition(employee.id, async () => {
      const result = await setEmployeeActiveAction(
        employee.id,
        !employee.isActive,
      );
      if (result.ok) {
        toast.success(
          employee.isActive ? "Mitarbeitende:r deaktiviert." : "Mitarbeitende:r aktiviert.",
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleUserLock(employee: EmployeeRow) {
    startTransition(employee.id, async () => {
      const locking = employee.userIsActive;
      let reason: string | undefined;
      if (locking) {
        const value = window.prompt(
          "Sperrgrund (z.B. Compliance, Sicherheitsvorfall) eingeben:",
        );
        if (value === null) return;
        reason = value;
      }

      const result = await setUserLockAction(employee.id, locking, reason);
      if (result.ok) {
        toast.success(locking ? "Benutzerkonto gesperrt." : "Benutzerkonto entsperrt.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {employees.length} Mitarbeitende ·{" "}
          {employees.filter((e) => e.isActive).length} aktiv
        </p>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus className="mr-1 h-4 w-4" />
          Neuen Mitarbeitenden anlegen
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Funktion</th>
                <th className="px-4 py-3">Pensum</th>
                <th className="px-4 py-3">Standort</th>
                <th className="px-4 py-3">Ferien</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {employees.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-neutral-500"
                  >
                    Noch keine Mitarbeitende angelegt.
                  </td>
                </tr>
              ) : null}
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-neutral-50/60">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">
                      {e.firstName} {e.lastName}
                    </div>
                    <div className="text-xs text-neutral-500">{e.email}</div>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {e.roleLabel ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{e.pensum}%</td>
                  <td className="px-4 py-3 text-neutral-700">
                    {e.locationName}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {e.vacationDaysPerYear} Tage
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {e.exitSnapshot &&
                      exitSnapshotBadgeEligible(e.exitSnapshot.exitDate) ? (
                        <Badge
                          variant="outline"
                          className="cursor-pointer border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100"
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            setSnapshotPanel({
                              mode: "open",
                              employeeLabel: `${e.firstName} ${e.lastName}`,
                              exitSnapshot: e.exitSnapshot!,
                            })
                          }
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              setSnapshotPanel({
                                mode: "open",
                                employeeLabel: `${e.firstName} ${e.lastName}`,
                                exitSnapshot: e.exitSnapshot!,
                              });
                            }
                          }}
                        >
                          Konten abgeschlossen am{" "}
                          {formatDeShort(e.exitSnapshot.exitDate)}
                        </Badge>
                      ) : null}
                      {e.isActive ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          Mitarbeit aktiv
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Mitarbeit inaktiv</Badge>
                      )}
                      {e.userIsActive ? (
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                          Login aktiv
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          Login gesperrt
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDialog({ mode: "edit", employee: e })}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Bearbeiten
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pendingId === e.id}
                        onClick={() => toggleActive(e)}
                      >
                        {e.isActive ? (
                          <>
                            <UserMinus className="mr-1 h-3.5 w-3.5" />
                            Deaktivieren
                          </>
                        ) : (
                          <>
                            <UserCheck className="mr-1 h-3.5 w-3.5" />
                            Aktivieren
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pendingId === e.id}
                        onClick={() => toggleUserLock(e)}
                      >
                        {e.userIsActive ? (
                          <>
                            <Lock className="mr-1 h-3.5 w-3.5" />
                            Sperren
                          </>
                        ) : (
                          <>
                            <LockOpen className="mr-1 h-3.5 w-3.5" />
                            Entsperren
                          </>
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialog.mode !== "closed"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-2xl">
          {dialog.mode === "create" ? (
            <EmployeeForm
              mode="create"
              defaults={createDefaults(defaultLocationId)}
              locations={locations}
              onSuccess={close}
            />
          ) : dialog.mode === "edit" ? (
            <EmployeeForm
              mode="edit"
              defaults={editDefaultsFromRow(dialog.employee)}
              locations={locations}
              onSuccess={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={snapshotPanel.mode === "open"}
        onOpenChange={(open) => !open && setSnapshotPanel({ mode: "closed" })}
      >
        <DialogContent className="sm:max-w-lg">
          {snapshotPanel.mode === "open" ? (
            <>
              <DialogHeader>
                <DialogTitle>Kontenabschluss</DialogTitle>
              </DialogHeader>
              <ExitSnapshotDetailBody
                employeeLabel={snapshotPanel.employeeLabel}
                exitSnapshot={snapshotPanel.exitSnapshot}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function formatDeShort(isoDateTime: string): string {
  const d = isoDateTime.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return isoDateTime;
  return `${day}.${m}.${y}`;
}

/** Badge nur anzeigen, wenn Austritt in der Vergangenheit liegt. */
function exitSnapshotBadgeEligible(snapshotExitIso: string): boolean {
  const snapDay = snapshotExitIso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return snapDay < today;
}

function ExitSnapshotDetailBody({
  employeeLabel,
  exitSnapshot,
}: {
  employeeLabel: string;
  exitSnapshot: NonNullable<EmployeeRow["exitSnapshot"]>;
}) {
  const parsed = parseExitSnapshotJson(exitSnapshot.snapshotJson);
  return (
    <div className="space-y-4 text-sm">
      <p className="text-neutral-600">
        <span className="font-medium text-neutral-900">{employeeLabel}</span>
        {" · "}
        Stand zum Austritt{" "}
        <span className="font-medium">{formatDeShort(exitSnapshot.exitDate)}</span>
      </p>
      {parsed ? (
        <ExitSnapshotTables data={parsed} />
      ) : (
        <pre className="max-h-64 overflow-auto rounded-md bg-neutral-50 p-3 text-xs">
          {exitSnapshot.snapshotJson}
        </pre>
      )}
    </div>
  );
}

function ExitSnapshotTables({ data }: { data: ExitSnapshotData }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 font-medium text-neutral-900">Konten</h4>
        {data.accounts.length === 0 ? (
          <p className="text-neutral-500">Keine Kontensätze erfasst.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200">
            <table className="min-w-full text-xs">
              <thead className="bg-neutral-50 text-left text-neutral-600">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Konto</th>
                  <th className="px-2 py-1.5 font-medium">Jahr</th>
                  <th className="px-2 py-1.5 font-medium">aktuell</th>
                  <th className="px-2 py-1.5 font-medium">Einheit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.accounts.map((a, i) => (
                  <tr key={`${a.accountType}-${a.year}-${i}`}>
                    <td className="px-2 py-1.5">{a.accountType}</td>
                    <td className="px-2 py-1.5">{a.year}</td>
                    <td className="px-2 py-1.5 font-mono">{a.currentValue}</td>
                    <td className="px-2 py-1.5">{a.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div>
        <h4 className="mb-2 font-medium text-neutral-900">Offene ERT-Pflichten</h4>
        {data.openErtCases.length === 0 ? (
          <p className="text-neutral-500">Keine offenen ERT-Vorgänge.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-neutral-700">
            {data.openErtCases.map((c) => (
              <li key={c.id}>
                Fällig {formatDeShort(c.dueAt)} · {c.holidayWorkMinutes} Min. ·{" "}
                {c.status}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="mb-2 font-medium text-neutral-900">
          Offene Feiertags-Kompensationen
        </h4>
        {data.openCompensationCases.length === 0 ? (
          <p className="text-neutral-500">Keine offenen Kompensationsfälle.</p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-neutral-700">
            {data.openCompensationCases.map((c) => (
              <li key={c.id}>
                Fällig {formatDeShort(c.dueAt)} · {c.holidayWorkMinutes} Min. ·{" "}
                {c.status}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function createDefaults(defaultLocationId: string): EmployeeFormDefaults {
  return {
    email: "",
    firstName: "",
    lastName: "",
    roleLabel: "",
    pensum: 100,
    entryDate: isoDateString(new Date()),
    exitDate: "",
    locationId: defaultLocationId,
    vacationDaysPerYear: 25,
    weeklyTargetMinutes: 2520,
    hazMinutesPerWeek: 2700,
    tztModel: "DAILY_QUOTA",
    standardWorkDays: null,
    isActive: true,
  };
}

function editDefaultsFromRow(row: EmployeeRow): EmployeeFormDefaults {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    roleLabel: row.roleLabel ?? "",
    pensum: row.pensum,
    entryDate: row.entryDate,
    exitDate: row.exitDate ?? "",
    locationId: row.locationId,
    vacationDaysPerYear: row.vacationDaysPerYear,
    weeklyTargetMinutes: row.weeklyTargetMinutes,
    hazMinutesPerWeek: row.hazMinutesPerWeek,
    tztModel: row.tztModel,
    standardWorkDays: row.standardWorkDays,
    isActive: row.isActive,
  };
}

function usePendingId(): [
  string | null,
  (id: string, fn: () => Promise<void>) => void,
] {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  function start(id: string, fn: () => Promise<void>) {
    setPendingId(id);
    startTransition(async () => {
      try {
        await fn();
      } finally {
        setPendingId(null);
      }
    });
  }
  return [pendingId, start];
}
