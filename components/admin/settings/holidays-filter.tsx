"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";

interface Props {
  locations: Array<{ id: string; name: string; holidayRegionCode: string }>;
  selectedLocationId: string;
  selectedYear: number;
}

export function HolidaysFilter({
  locations,
  selectedLocationId,
  selectedYear,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const update = (next: { locationId?: string; year?: number }) => {
    const params = new URLSearchParams(sp.toString());
    if (next.locationId !== undefined) params.set("locationId", next.locationId);
    if (next.year !== undefined) params.set("year", String(next.year));
    router.push(`/settings?${params.toString()}`);
  };

  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = currentYear - 1; y <= currentYear + 2; y++) yearOptions.push(y);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="filter-location">Standort</Label>
        <select
          id="filter-location"
          value={selectedLocationId}
          onChange={(e) => update({ locationId: e.target.value })}
          className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.holidayRegionCode})
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="filter-year">Jahr</Label>
        <select
          id="filter-year"
          value={selectedYear}
          onChange={(e) => update({ year: Number(e.target.value) })}
          className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
