import Link from "next/link";
import { Landmark } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

interface CompensationCasesKpiProps {
  openCount: number;
  overdueCount: number;
}

/** SFK-Verfallsüberblick für das Admin-Dashboard (Spec: Fristenkontrolle). */
export function CompensationCasesKpi({
  openCount,
  overdueCount,
}: CompensationCasesKpiProps) {
  return (
    <Link
      href="/compensation-cases"
      className="group rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Sonn-/Feiertagskomp.
        </p>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 transition group-hover:bg-neutral-900 group-hover:text-white">
          <Landmark className="h-4 w-4" />
        </span>
      </div>
      <dl className="mt-2 space-y-1 text-neutral-900">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-sm text-neutral-600">Offene Fälle</dt>
          <dd className="text-2xl font-semibold tabular-nums">{openCount}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-sm text-neutral-600">Überfällig</dt>
          <dd className="text-lg font-semibold tabular-nums text-amber-800">
            {overdueCount}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex justify-end">
        <ArrowUpRight className="h-3.5 w-3.5 text-neutral-400 transition group-hover:text-neutral-700" />
      </div>
    </Link>
  );
}
