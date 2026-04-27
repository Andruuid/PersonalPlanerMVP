"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addHolidayAction } from "@/server/holidays";

interface Props {
  locationId: string;
  defaultYear: number;
}

export function HolidayAddForm({ locationId, defaultYear }: Props) {
  const [errors, setErrors] = useState<{
    message: string;
    fieldErrors: Record<string, string>;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrors(null);
    startTransition(async () => {
      const result = await addHolidayAction(undefined, formData);
      if (result.ok) {
        toast.success("Feiertag hinzugefügt.");
        formRef.current?.reset();
        return;
      }
      setErrors({
        message: result.error,
        fieldErrors: result.fieldErrors ?? {},
      });
    });
  }

  const fieldErr = errors?.fieldErrors ?? {};

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
    >
      <input type="hidden" name="locationId" value={locationId} />

      <div className="space-y-1.5">
        <Label htmlFor="holiday-date">Datum</Label>
        <Input
          id="holiday-date"
          name="date"
          type="date"
          defaultValue={`${defaultYear}-01-01`}
          required
        />
        {fieldErr.date ? (
          <p className="text-xs text-rose-700">{fieldErr.date}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="holiday-name">Name</Label>
        <Input
          id="holiday-name"
          name="name"
          required
          placeholder="z. B. Bundesfeier"
        />
        {fieldErr.name ? (
          <p className="text-xs text-rose-700">{fieldErr.name}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={pending}>
        <Plus className="mr-1 h-4 w-4" />
        {pending ? "Speichern..." : "Hinzufügen"}
      </Button>

      {errors?.message ? (
        <p className="sm:col-span-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {errors.message}
        </p>
      ) : null}
    </form>
  );
}
