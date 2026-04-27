"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shiftWeek } from "@/lib/time/week";

interface WeekSelectorProps {
  year: number;
  weekNumber: number;
}

function buildHref(year: number, weekNumber: number): string {
  return `/planning?year=${year}&week=${weekNumber}`;
}

export function WeekSelector({ year, weekNumber }: WeekSelectorProps) {
  const prev = shiftWeek({ year, weekNumber }, -1);
  const next = shiftWeek({ year, weekNumber }, 1);

  return (
    <div className="flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-1 py-1">
      <Button asChild size="icon" variant="ghost">
        <Link
          href={buildHref(prev.year, prev.weekNumber)}
          aria-label="Vorherige Woche"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </Button>
      <span className="px-2 text-sm font-medium text-neutral-700">
        KW {weekNumber} · {year}
      </span>
      <Button asChild size="icon" variant="ghost">
        <Link
          href={buildHref(next.year, next.weekNumber)}
          aria-label="Nächste Woche"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
