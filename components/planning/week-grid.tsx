"use client";

import { GridCell } from "./grid-cell";
import { entryKey, type DayView, type EmployeeView, type EntryMap } from "./types";

interface WeekGridProps {
  employees: EmployeeView[];
  days: DayView[];
  entries: EntryMap;
  selectedKey: string | null;
  locked: boolean;
  onSelect: (employeeId: string, isoDate: string) => void;
  onOpenAssign: (employeeId: string, isoDate: string) => void;
}

export function WeekGrid({
  employees,
  days,
  entries,
  selectedKey,
  locked,
  onSelect,
  onOpenAssign,
}: WeekGridProps) {
  if (employees.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
        Keine aktiven Mitarbeitenden. Lege unter «Mitarbeitende» mindestens
        eine:n Aktiven an, um die Wochenplanung zu nutzen.
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-4">
      <div
        className="grid w-full min-w-0 gap-2 sm:gap-3"
        style={{
          gridTemplateColumns: `minmax(9rem, 12rem) repeat(${days.length}, minmax(4.5rem, 1fr))`,
        }}
      >
        <div className="app-label-caps text-xs text-neutral-500">Mitarbeitende</div>
        {days.map((d) => (
          <div
            key={d.iso}
            className="app-label-caps text-center text-xs text-neutral-500"
          >
            <div className="flex items-center justify-center gap-1">
              <span>{d.weekdayLabel}</span>
              {d.understaffed ? (
                <span
                  aria-label="Tag unterbesetzt"
                  title="Tag unterbesetzt — Sollvorgabe nicht erreicht"
                  className="inline-block h-2 w-2 rounded-full bg-amber-500"
                />
              ) : null}
            </div>
            <div className="font-normal text-neutral-400">{d.shortDate}</div>
          </div>
        ))}

        {employees.map((emp) => (
          <RowFragment
            key={emp.id}
            employee={emp}
            days={days}
            entries={entries}
            selectedKey={selectedKey}
            locked={locked}
            onSelect={onSelect}
            onOpenAssign={onOpenAssign}
          />
        ))}
      </div>
    </div>
  );
}

interface RowFragmentProps {
  employee: EmployeeView;
  days: DayView[];
  entries: EntryMap;
  selectedKey: string | null;
  locked: boolean;
  onSelect: (employeeId: string, isoDate: string) => void;
  onOpenAssign: (employeeId: string, isoDate: string) => void;
}

function RowFragment({
  employee,
  days,
  entries,
  selectedKey,
  locked,
  onSelect,
  onOpenAssign,
}: RowFragmentProps) {
  return (
    <>
      <div className="flex min-w-0 flex-col justify-center">
        <p className="truncate font-medium text-neutral-900">
          {employee.firstName} {employee.lastName}
        </p>
        {employee.roleLabel ? (
          <p className="truncate text-xs text-neutral-500">
            {employee.roleLabel}
          </p>
        ) : null}
      </div>
      {days.map((day) => {
        const key = entryKey(employee.id, day.iso);
        const entry = entries[key] ?? null;
        const selected = selectedKey === key;
        return (
          <GridCell
            key={key}
            employeeId={employee.id}
            isoDate={day.iso}
            entry={entry}
            selected={selected}
            locked={locked}
            onSelect={() => onSelect(employee.id, day.iso)}
            onOpenAssign={() => onOpenAssign(employee.id, day.iso)}
          />
        );
      })}
    </>
  );
}
