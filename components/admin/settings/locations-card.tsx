"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  LocationForm,
  type HolidayConfession,
  type LocationFormDefaults,
} from "./location-form";

export interface LocationRow {
  id: string;
  name: string;
  holidayRegionCode: string;
  employeeCount: number;
  holidayCount: number;
}

function confessionLabel(code: string): string {
  switch (code.toUpperCase()) {
    case "EVANGELISCH":
      return "Konfession Evangelisch";
    case "KATHOLISCH":
      return "Konfession Katholisch";
    // Legacy canton codes can still appear in untouched data; show them as
    // the confession they map to so admins see consistent wording.
    case "ZH":
      return "Konfession Evangelisch";
    case "LU":
    case "BE":
    case "BS":
      return "Konfession Katholisch";
    default:
      return `Konfession ${code}`;
  }
}

function defaultConfession(code: string): HolidayConfession {
  const upper = code.toUpperCase();
  if (upper === "KATHOLISCH" || upper === "LU" || upper === "BE" || upper === "BS") {
    return "KATHOLISCH";
  }
  return "EVANGELISCH";
}

interface Props {
  locations: LocationRow[];
}

type DialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; location: LocationRow };

export function LocationsCard({ locations }: Props) {
  const [dialog, setDialog] = useState<DialogState>({ mode: "closed" });
  const close = () => setDialog({ mode: "closed" });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Standorte</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDialog({ mode: "create" })}
        >
          <Plus className="mr-1 h-4 w-4" />
          Neuer Standort
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-neutral-100">
          {locations.length === 0 ? (
            <li className="py-6 text-center text-sm text-neutral-500">
              Noch keine Standorte angelegt.
            </li>
          ) : null}
          {locations.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium text-neutral-900">{l.name}</p>
                <p className="text-xs text-neutral-500">
                  {confessionLabel(l.holidayRegionCode)} · {l.employeeCount}{" "}
                  Mitarbeitende · {l.holidayCount} Feiertage
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/locations/${l.id}/holidays`}>Feiertage</Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDialog({ mode: "edit", location: l })}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Bearbeiten
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>

      <Dialog
        open={dialog.mode !== "closed"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent>
          {dialog.mode === "create" ? (
            <LocationForm
              mode="create"
              defaults={{ name: "", holidayRegionCode: "EVANGELISCH" }}
              onSuccess={close}
            />
          ) : dialog.mode === "edit" ? (
            <LocationForm
              mode="edit"
              defaults={editDefaults(dialog.location)}
              onSuccess={close}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function editDefaults(row: LocationRow): LocationFormDefaults {
  return {
    id: row.id,
    name: row.name,
    holidayRegionCode: defaultConfession(row.holidayRegionCode),
  };
}
