"use client";

import { useState, useTransition } from "react";
import { CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { runYearEndCarryoverAction } from "@/server/bookings";

interface Props {
  defaultFromYear: number;
}

export function YearEndButton({ defaultFromYear }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await runYearEndCarryoverAction(undefined, formData);
      if (result.ok) {
        toast.success(
          `Jahreswechsel ausgeführt: Saldi nach ${
            Number.parseInt(
              (formData.get("fromYear") as string) ?? `${defaultFromYear}`,
              10,
            ) + 1
          } übertragen.`,
        );
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CalendarRange className="mr-1 h-4 w-4" />
        Jahreswechsel
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Jahreswechsel ausführen</DialogTitle>
              <DialogDescription>
                Schliesst das gewählte Jahr ab und überträgt Zeitsaldo, Ferien,
                UEZ und TZT als CARRYOVER-Buchung in das Folgejahr. Der Vorgang
                ist idempotent — eine erneute Ausführung ersetzt bestehende
                Vorträge.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <label
                htmlFor="fromYear"
                className="text-sm font-medium text-neutral-800"
              >
                Abschlussjahr
              </label>
              <input
                id="fromYear"
                name="fromYear"
                type="number"
                min={2000}
                max={2100}
                defaultValue={defaultFromYear}
                required
                className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
              />
              <p className="text-xs text-neutral-500">
                Beispiel: {defaultFromYear} → Vortrag in {defaultFromYear + 1}
              </p>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Abbrechen
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Ausführen..." : "Übertragen"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
