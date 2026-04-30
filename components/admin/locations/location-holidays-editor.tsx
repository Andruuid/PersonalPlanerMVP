"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  acceptProposedHolidaysAction,
  proposeHolidaysForLocationAction,
  type HolidayDraft,
} from "@/server/holidays";

type Confession = "EVANGELISCH" | "KATHOLISCH";

interface Props {
  locationId: string;
  locationName: string;
  defaultConfession: Confession;
  initialYear: number;
  initialExistingHolidays: HolidayDraft[];
}

interface DraftHoliday extends HolidayDraft {
  selected: boolean;
}

function sortByDate(items: HolidayDraft[]): HolidayDraft[] {
  return [...items].sort((a, b) => a.date.localeCompare(b.date));
}

export function LocationHolidaysEditor({
  locationId,
  locationName,
  defaultConfession,
  initialYear,
  initialExistingHolidays,
}: Props) {
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => [currentYear, currentYear + 1], [currentYear]);

  const [year, setYear] = useState(initialYear);
  const [confession, setConfession] = useState<Confession>(defaultConfession);
  const [rows, setRows] = useState<DraftHoliday[]>([]);
  const [customDate, setCustomDate] = useState("");
  const [customName, setCustomName] = useState("");
  const [isLoadingProposal, startProposalTransition] = useTransition();
  const [isSaving, startSaveTransition] = useTransition();

  useEffect(() => {
    startProposalTransition(async () => {
      const result = await proposeHolidaysForLocationAction(locationId, year, confession);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const proposed = (result.data?.holidays ?? []).map((h) => ({
        ...h,
        selected: true,
      }));
      setRows(proposed);
    });
  }, [locationId, year, confession]);

  const selectedRows = rows
    .filter((r) => r.selected)
    .map(({ date, name }) => ({ date, name }));

  function toggleSelected(index: number, selected: boolean) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, selected } : row)),
    );
  }

  function addCustomHoliday() {
    const date = customDate.trim();
    const name = customName.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Datum muss im Format YYYY-MM-DD sein.");
      return;
    }
    if (!date.startsWith(`${year}-`)) {
      toast.error(`Datum muss im Jahr ${year} liegen.`);
      return;
    }
    if (!name) {
      toast.error("Name erforderlich.");
      return;
    }
    setRows((prev) => {
      const existingIdx = prev.findIndex((p) => p.date === date);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { date, name, selected: true };
        return next.sort((a, b) => a.date.localeCompare(b.date));
      }
      return [...prev, { date, name, selected: true }].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    });
    setCustomDate("");
    setCustomName("");
  }

  function save() {
    startSaveTransition(async () => {
      const result = await acceptProposedHolidaysAction(
        locationId,
        year,
        sortByDate(selectedRows),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const diff = result.data;
      toast.success(
        `Feiertage gespeichert: +${diff?.added ?? 0}, -${diff?.removed ?? 0}, geändert ${
          diff?.updated ?? 0
        }.`,
      );
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="holiday-year">Jahr</Label>
          <select
            id="holiday-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Konfession</Label>
          <div className="flex gap-4 rounded-md border border-neutral-200 p-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="confession"
                checked={confession === "EVANGELISCH"}
                onChange={() => setConfession("EVANGELISCH")}
              />
              Evangelisch
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="confession"
                checked={confession === "KATHOLISCH"}
                onChange={() => setConfession("KATHOLISCH")}
              />
              Katholisch
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">
        Vorschläge werden für {locationName} neu berechnet, aber bestehende
        Feiertage bleiben unverändert, bis auf „Speichern“ geklickt wird.
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2.5">Übernehmen</th>
              <th className="px-4 py-2.5">Datum</th>
              <th className="px-4 py-2.5">Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row, idx) => (
              <tr key={`${row.date}-${idx}`}>
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) => toggleSelected(idx, e.target.checked)}
                  />
                </td>
                <td className="px-4 py-2.5 font-medium">{row.date}</td>
                <td className="px-4 py-2.5">{row.name}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-neutral-500">
                  {isLoadingProposal
                    ? "Vorschläge werden geladen..."
                    : "Keine Vorschläge vorhanden."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 p-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="custom-holiday-date">Lokaler Feiertag - Datum</Label>
          <Input
            id="custom-holiday-date"
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="custom-holiday-name">Lokaler Feiertag - Name</Label>
          <Input
            id="custom-holiday-name"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="z. B. Sechseläuten"
          />
        </div>
        <Button type="button" variant="outline" onClick={addCustomHoliday}>
          <Plus className="mr-1 h-4 w-4" />
          Hinzufügen
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          {selectedRows.length} Feiertage ausgewählt. Bereits gespeichert für {year}:{" "}
          {initialExistingHolidays.length}
        </p>
        <Button type="button" onClick={save} disabled={isSaving || isLoadingProposal}>
          <Save className="mr-1 h-4 w-4" />
          {isSaving ? "Speichern..." : "Speichern"}
        </Button>
      </div>
    </div>
  );
}
