"use client";

import { useState, useTransition } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteHolidayAction,
  generateRegionHolidaysAction,
} from "@/server/holidays";

export interface HolidayRow {
  id: string;
  date: string;
  name: string;
  weekday: string;
}

interface Props {
  holidays: HolidayRow[];
  locationId: string;
  year: number;
  region: string;
}

export function HolidaysList({ holidays, locationId, year, region }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [, startTransition] = useTransition();

  function handleDelete(id: string) {
    setPendingId(id);
    startTransition(async () => {
      try {
        const result = await deleteHolidayAction(id);
        if (result.ok) toast.success("Feiertag entfernt.");
        else toast.error(result.error);
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleGenerate() {
    setGenerating(true);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("locationId", locationId);
        fd.set("year", String(year));
        const result = await generateRegionHolidaysAction(undefined, fd);
        if (result.ok) {
          const d = result.data;
          toast.success(
            `Feiertage für ${region} ${year}: ${d?.created ?? 0} angelegt, ${
              d?.skipped ?? 0
            } übersprungen.`,
          );
        } else {
          toast.error(result.error);
        }
      } finally {
        setGenerating(false);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {holidays.length} Feiertage in {year}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
        >
          <Sparkles className="mr-1 h-4 w-4" />
          {generating
            ? "Wird generiert..."
            : `Feiertage ${region} ${year} generieren`}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2.5">Datum</th>
              <th className="px-4 py-2.5">Wochentag</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {holidays.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-sm text-neutral-500"
                >
                  Noch keine Feiertage für dieses Jahr. Verwende „Generieren“
                  oder lege manuelle Einträge an.
                </td>
              </tr>
            ) : null}
            {holidays.map((h) => (
              <tr key={h.id} className="hover:bg-neutral-50/60">
                <td className="px-4 py-2.5 font-medium text-neutral-900">
                  {h.date}
                </td>
                <td className="px-4 py-2.5 text-neutral-600">{h.weekday}</td>
                <td className="px-4 py-2.5 text-neutral-700">{h.name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === h.id}
                      onClick={() => handleDelete(h.id)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Entfernen
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
