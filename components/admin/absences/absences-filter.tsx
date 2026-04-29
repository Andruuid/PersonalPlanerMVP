"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { buildAbsenceFilterSearchParams } from "./filter-query";

export type StatusFilter = "ALL" | "OPEN" | "APPROVED" | "REJECTED";
export type TypeFilter =
  | "ALL"
  | "VACATION"
  | "FREE_REQUESTED"
  | "UEZ_BEZUG"
  | "TZT"
  | "FREE_DAY";

interface AbsencesFilterProps {
  status: StatusFilter;
  type: TypeFilter;
  employeeId: string | "ALL";
  employees: Array<{ id: string; firstName: string; lastName: string }>;
  counts: Record<StatusFilter, number>;
}

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: "ALL", label: "Alle" },
  { key: "OPEN", label: "Offen" },
  { key: "APPROVED", label: "Genehmigt" },
  { key: "REJECTED", label: "Abgelehnt" },
];

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: "ALL", label: "Alle Typen" },
  { value: "VACATION", label: "Ferien" },
  { value: "FREE_REQUESTED", label: "Frei verlangt" },
  { value: "UEZ_BEZUG", label: "UEZ-Bezug" },
  { value: "TZT", label: "TZT" },
  { value: "FREE_DAY", label: "Freier Tag" },
];

export function AbsencesFilter({
  status,
  type,
  employeeId,
  employees,
  counts,
}: AbsencesFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = buildAbsenceFilterSearchParams(searchParams, key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => update("status", tab.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px]",
                  active ? "bg-white/20 text-white" : "bg-white text-neutral-500",
                )}
              >
                {counts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-neutral-600">
          Mitarbeitende:r
          <select
            value={employeeId}
            onChange={(e) => update("employee", e.target.value)}
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            <option value="ALL">Alle Mitarbeitenden</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-neutral-600">
          Typ
          <select
            value={type}
            onChange={(e) => update("type", e.target.value)}
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
