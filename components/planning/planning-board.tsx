"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { KpiBar } from "./kpi-bar";
import { WeekGrid } from "./week-grid";
import { AssignmentDialog } from "./assignment-dialog";
import { DetailPanel } from "./detail-panel";
import { RequestsPanel } from "./requests-panel";
import { ServicesPalette } from "./services-palette";
import { StatusControls } from "./status-controls";
import { WeekSelector } from "./week-selector";
import {
  entryKey,
  type DayView,
  type EmployeeView,
  type EntryMap,
  type KpiSummary,
  type PlanEntryView,
  type RequestView,
  type ServiceOption,
  type WeekView,
} from "./types";
import {
  movePlanEntryAction,
  upsertPlanEntryAction,
} from "@/server/planning";

interface PlanningBoardProps {
  week: WeekView;
  days: DayView[];
  employees: EmployeeView[];
  entries: EntryMap;
  services: ServiceOption[];
  requests: RequestView[];
  kpi: KpiSummary;
  locationName: string;
}

interface DialogState {
  open: boolean;
  employeeId: string;
  isoDate: string;
}

export function PlanningBoard({
  week,
  days,
  employees,
  entries,
  services,
  requests,
  kpi,
  locationName,
}: PlanningBoardProps) {
  const locked = week.status === "CLOSED";
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    employeeId: "",
    isoDate: "",
  });
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const employeeMap = useMemo(() => {
    const map = new Map<string, EmployeeView>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const dayMap = useMemo(() => {
    const map = new Map<string, DayView>();
    for (const d of days) map.set(d.iso, d);
    return map;
  }, [days]);

  function handleSelect(employeeId: string, isoDate: string) {
    setSelectedKey(entryKey(employeeId, isoDate));
  }

  function openAssign(employeeId: string, isoDate: string) {
    if (locked) {
      toast.info("Diese Woche ist abgeschlossen.");
      return;
    }
    setSelectedKey(entryKey(employeeId, isoDate));
    setDialog({ open: true, employeeId, isoDate });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || locked) return;

    const overData = over.data.current as
      | { type: "cell"; employeeId: string; isoDate: string }
      | undefined;
    if (!overData || overData.type !== "cell") return;

    const targetEmployeeId = overData.employeeId;
    const targetIsoDate = overData.isoDate;

    const activeData = active.data.current as
      | { type: "entry"; entryId: string }
      | { type: "palette-service"; serviceId: string }
      | { type: "palette-absence"; absenceType: string }
      | undefined;
    if (!activeData) return;

    if (activeData.type === "entry") {
      startTransition(async () => {
        const r = await movePlanEntryAction(
          activeData.entryId,
          targetEmployeeId,
          targetIsoDate,
        );
        if (!r.ok) toast.error(r.error);
      });
      return;
    }

    if (activeData.type === "palette-service") {
      startTransition(async () => {
        const r = await upsertPlanEntryAction({
          kind: "SHIFT",
          weekId: week.id,
          employeeId: targetEmployeeId,
          date: targetIsoDate,
          serviceTemplateId: activeData.serviceId,
        });
        if (r.ok) toast.success("Dienst zugewiesen.");
        else toast.error(r.error);
      });
      return;
    }

    if (activeData.type === "palette-absence") {
      startTransition(async () => {
        const r = await upsertPlanEntryAction({
          kind: "ABSENCE",
          weekId: week.id,
          employeeId: targetEmployeeId,
          date: targetIsoDate,
          absenceType: activeData.absenceType as
            | "VACATION"
            | "SICK"
            | "ACCIDENT"
            | "FREE_REQUESTED"
            | "UNPAID"
            | "TZT"
            | "HOLIDAY_AUTO",
        });
        if (r.ok) toast.success("Abwesenheit gesetzt.");
        else toast.error(r.error);
      });
    }
  }

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    const [employeeId, isoDate] = selectedKey.split("__");
    return { employeeId, isoDate };
  }, [selectedKey]);

  const selectedEmployee = selected
    ? employeeMap.get(selected.employeeId) ?? null
    : null;
  const selectedDay = selected ? dayMap.get(selected.isoDate) ?? null : null;
  const selectedEntry: PlanEntryView | null = selected
    ? entries[entryKey(selected.employeeId, selected.isoDate)] ?? null
    : null;

  const dialogEntry = dialog.open
    ? entries[entryKey(dialog.employeeId, dialog.isoDate)] ?? null
    : null;
  const dialogEmployee = dialog.open
    ? employeeMap.get(dialog.employeeId) ?? null
    : null;
  const dialogDay = dialog.open ? dayMap.get(dialog.isoDate) ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-5">
          <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                KW {week.weekNumber} · {locationName}
              </p>
              <h1 className="text-2xl font-semibold text-neutral-900 md:text-3xl">
                Wochenplanung
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <WeekSelector year={week.year} weekNumber={week.weekNumber} />
              <StatusControls week={week} />
            </div>
          </header>

          <KpiBar summary={kpi} />

          <ServicesPalette services={services} locked={locked} />

          <WeekGrid
            employees={employees}
            days={days}
            entries={entries}
            selectedKey={selectedKey}
            locked={locked}
            onSelect={handleSelect}
            onOpenAssign={openAssign}
          />
        </div>

        <aside className="w-full shrink-0 space-y-4 lg:w-80 xl:w-96">
          <RequestsPanel requests={requests} />
          <DetailPanel
            weekId={week.id}
            selectedKey={selectedKey}
            selectedEmployeeId={selectedEmployee?.id ?? null}
            selectedEmployeeName={
              selectedEmployee
                ? `${selectedEmployee.firstName} ${selectedEmployee.lastName}`
                : null
            }
            selectedIsoDate={selectedDay?.iso ?? null}
            selectedDateLabel={selectedDay?.longDate ?? null}
            entry={selectedEntry}
            locked={locked}
          />
        </aside>
      </div>

      <AssignmentDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        weekId={week.id}
        employeeId={dialog.employeeId}
        employeeName={
          dialogEmployee
            ? `${dialogEmployee.firstName} ${dialogEmployee.lastName}`
            : ""
        }
        isoDate={dialog.isoDate}
        longDate={dialogDay?.longDate ?? ""}
        services={services}
        initialEntry={dialogEntry}
      />
    </DndContext>
  );
}
