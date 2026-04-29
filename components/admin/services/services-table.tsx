"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ServiceForm,
  type ServiceFormDefaults,
} from "./service-form";
import { setServiceActiveAction } from "@/server/services";

export interface ServiceRow {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  comment: string | null;
  defaultDays: number | null;
  requiredCount: number | null;
  isActive: boolean;
}

interface Props {
  services: ServiceRow[];
}

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; service: ServiceRow };

export function ServicesTable({ services }: Props) {
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const close = () => setDialog({ mode: "closed" });

  function toggleActive(service: ServiceRow) {
    setPendingId(service.id);
    startTransition(async () => {
      try {
        const result = await setServiceActiveAction(
          service.id,
          !service.isActive,
        );
        if (result.ok) {
          toast.success(
            service.isActive
              ? "Dienstvorlage deaktiviert."
              : "Dienstvorlage aktiviert.",
          );
        } else {
          toast.error(result.error);
        }
      } finally {
        setPendingId(null);
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {services.length} Vorlagen ·{" "}
          {services.filter((s) => s.isActive).length} aktiv
        </p>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus className="mr-1 h-4 w-4" />
          Neue Dienstvorlage
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Kürzel</th>
                <th className="px-4 py-3">Zeit</th>
                <th className="px-4 py-3">Pause</th>
                <th className="px-4 py-3">Kommentar</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {services.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-neutral-500"
                  >
                    Noch keine Dienstvorlagen angelegt.
                  </td>
                </tr>
              ) : null}
              {services.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50/60">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {s.name}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">
                      {s.code}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {s.startTime} – {s.endTime}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {s.breakMinutes} min
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {s.comment ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {s.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                        Aktiv
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Inaktiv</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDialog({ mode: "edit", service: s })}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Bearbeiten
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pendingId === s.id}
                        onClick={() => toggleActive(s)}
                      >
                        {s.isActive ? (
                          <>
                            <PowerOff className="mr-1 h-3.5 w-3.5" />
                            Deaktivieren
                          </>
                        ) : (
                          <>
                            <Power className="mr-1 h-3.5 w-3.5" />
                            Aktivieren
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

      <Dialog
        open={dialog.mode !== "closed"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent className="sm:max-w-xl">
          {dialog.mode === "create" ? (
            <ServiceForm
              mode="create"
              defaults={createDefaults()}
              onSuccess={close}
            />
          ) : dialog.mode === "edit" ? (
            <ServiceForm
              mode="edit"
              defaults={editDefaultsFromRow(dialog.service)}
              onSuccess={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function createDefaults(): ServiceFormDefaults {
  return {
    name: "",
    code: "",
    startTime: "08:00",
    endTime: "17:00",
    breakMinutes: 30,
    comment: "",
    defaultDays: null,
    requiredCount: null,
    isActive: true,
  };
}

function editDefaultsFromRow(row: ServiceRow): ServiceFormDefaults {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    startTime: row.startTime,
    endTime: row.endTime,
    breakMinutes: row.breakMinutes,
    comment: row.comment ?? "",
    defaultDays: row.defaultDays,
    requiredCount: row.requiredCount,
    isActive: row.isActive,
  };
}
