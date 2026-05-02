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
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { KpiBar } from "./kpi-bar";
import { WeekGrid } from "./week-grid";
import { WeekMobileView } from "./week-mobile-view";
import { AssignmentDialog } from "./assignment-dialog";
import { DetailPanel } from "./detail-panel";
import { RequestsPanel } from "./requests-panel";
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
import type { PlanEntryByDate } from "@/lib/time/balance";
import { movePlanEntryAction } from "@/server/planning";

interface PlanningBoardProps {
  week: WeekView;
  days: DayView[];
  employees: EmployeeView[];
  entries: EntryMap;
  services: ServiceOption[];
  requests: RequestView[];
  kpi: KpiSummary;
  locationName: string;
  weekYear: number;
  weekNumber: number;
  streakContextsByEmployee: Record<string, PlanEntryByDate[]>;
  holidayIsosForEmployee: Record<string, string[]>;
  /** Pro Mitarbeitendem und ISO-Datum: Anzeige-Ist−Soll (Minuten). */
  dailyZeitBalanceByEmployee: Record<string, Record<string, number>>;
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
  weekYear,
  weekNumber,
  streakContextsByEmployee,
  holidayIsosForEmployee,
  dailyZeitBalanceByEmployee,
}: PlanningBoardProps) {
  const locked = week.status === "CLOSED";
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({
    open: false,
    employeeId: "",
    isoDate: "",
  });
  const [requestsSheetOpen, setRequestsSheetOpen] = useState(false);
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
    setSelectedKey(entryKey(employeeId, isoDate));
    if (locked) {
      toast.info("Diese Woche ist abgeschlossen.");
      return;
    }
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
      | undefined;
    if (!activeData || activeData.type !== "entry") return;

    startTransition(async () => {
      const r = await movePlanEntryAction(
        activeData.entryId,
        targetEmployeeId,
        targetIsoDate,
      );
      if (!r.ok) toast.error(r.error);
    });
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

  const openRequestCount = kpi.openRequests;

  return (
    <DndContext
      id={`planning-board-dnd-${week.id}`}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-6">
        <div className="min-w-0 space-y-5">
          <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <p className="app-label-caps text-xs text-neutral-500">
                KW {week.weekNumber} · {locationName}
              </p>
              <h1 className="app-page-title text-2xl font-semibold text-neutral-900 md:text-3xl">
                Wochenplanung
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <WeekSelector year={week.year} weekNumber={week.weekNumber} />
              <StatusControls week={week} />
            </div>
          </header>

          <KpiBar summary={kpi} />

          <div className="flex flex-col gap-2 md:hidden">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center border-neutral-300"
              onClick={() => setRequestsSheetOpen(true)}
            >
              Anträge ({openRequestCount})
            </Button>
          </div>

          <WeekMobileView
            employees={employees}
            days={days}
            entries={entries}
            selectedKey={selectedKey}
            locked={locked}
            onOpenAssign={openAssign}
            dailyZeitBalanceByEmployee={dailyZeitBalanceByEmployee}
            weekYear={weekYear}
            weekNumber={weekNumber}
          />

          <WeekGrid
            employees={employees}
            days={days}
            entries={entries}
            selectedKey={selectedKey}
            locked={locked}
            onSelect={handleSelect}
            onOpenAssign={openAssign}
            dailyZeitBalanceByEmployee={dailyZeitBalanceByEmployee}
            weekYear={weekYear}
            weekNumber={weekNumber}
          />
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,16rem)_1fr] xl:grid-cols-[minmax(0,18rem)_1fr]">
          <div className="hidden md:block">
            <RequestsPanel requests={requests} openCount={openRequestCount} />
          </div>
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
        </div>
      </div>

      <AssignmentDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        weekId={week.id}
        weekYear={weekYear}
        weekNumber={weekNumber}
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
        streakContextEntries={
          streakContextsByEmployee[dialog.employeeId] ?? []
        }
        holidayIsos={holidayIsosForEmployee[dialog.employeeId] ?? []}
      />

      <Sheet open={requestsSheetOpen} onOpenChange={setRequestsSheetOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[90vh] flex-col gap-2 overflow-hidden"
        >
          <SheetHeader className="shrink-0 text-left">
            <SheetTitle>Anträge</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pb-2">
            <RequestsPanel
              requests={requests}
              openCount={openRequestCount}
              embedded
            />
          </div>
        </SheetContent>
      </Sheet>
    </DndContext>
  );
}
