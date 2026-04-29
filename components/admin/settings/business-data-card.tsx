"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateTenantBusinessDefaultsAction } from "@/server/settings";

interface Props {
  defaultStandardWorkDays: number;
}

export function BusinessDataCard({ defaultStandardWorkDays }: Props) {
  const [errors, setErrors] = useState<{
    message: string;
    fieldErrors: Record<string, string>;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setErrors(null);
    startTransition(async () => {
      const result = await updateTenantBusinessDefaultsAction(undefined, formData);
      if (result.ok) {
        toast.success("Betriebsdaten gespeichert.");
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
    <Card>
      <CardHeader>
        <CardTitle>Betriebsdaten</CardTitle>
        <CardDescription>
          Stammdaten für die Verteilung der wöchentlichen Sollzeit auf
          Arbeitstage (Spec).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="flex max-w-md flex-col gap-4 sm:flex-row sm:items-end"
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="defaultStandardWorkDays">
              Standard-Arbeitstage pro Woche
            </Label>
            <Input
              id="defaultStandardWorkDays"
              name="defaultStandardWorkDays"
              type="number"
              min={1}
              max={7}
              step={1}
              defaultValue={defaultStandardWorkDays}
              required
            />
            {fieldErr.defaultStandardWorkDays ? (
              <p className="text-xs text-rose-700">
                {fieldErr.defaultStandardWorkDays}
              </p>
            ) : (
              <p className="text-xs text-neutral-500">
                Wochensoll wird durch diese Anzahl geteilt (üblicherweise 5).
              </p>
            )}
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Speichern..." : "Speichern"}
          </Button>
        </form>
        {errors?.message ? (
          <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
            {errors.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
