"use client";

import { useState } from "react";
import {
  deactivateTenantAction,
  reactivateTenantAction,
  updateTenantAction,
} from "@/server/system-admin/tenants";

interface Props {
  tenantId: string;
  initial: {
    name: string;
    slug: string;
    defaultWeeklyTargetMinutes: number;
    defaultHazMinutesPerWeek: number;
    deletedAt: string | null;
  };
}

export function TenantDetailActions({ tenantId, initial }: Props) {
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [pending, setPending] = useState(false);

  async function runDeactivate() {
    setPending(true);
    setMessage("");
    setError("");
    const res = await deactivateTenantAction(tenantId);
    setPending(false);
    if (!res.ok) return setError(res.error);
    setMessage("Mandant wurde deaktiviert.");
  }

  async function runReactivate() {
    setPending(true);
    setMessage("");
    setError("");
    const res = await reactivateTenantAction(tenantId);
    setPending(false);
    if (!res.ok) return setError(res.error);
    setMessage("Mandant wurde reaktiviert.");
  }

  async function onUpdate(formData: FormData) {
    setPending(true);
    setMessage("");
    setError("");
    const res = await updateTenantAction(formData);
    setPending(false);
    if (!res.ok) return setError(res.error);
    setMessage("Stammdaten aktualisiert.");
  }

  return (
    <div className="space-y-4">
      <form action={onUpdate} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <input type="hidden" name="tenantId" value={tenantId} />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Name</span>
            <input
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              defaultValue={initial.name}
              name="name"
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Slug</span>
            <input
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              defaultValue={initial.slug}
              name="slug"
              required
            />
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Default-Sollzeit (Min./Woche)</span>
            <input
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              defaultValue={initial.defaultWeeklyTargetMinutes}
              type="number"
              min={60}
              name="defaultWeeklyTargetMinutes"
              required
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-slate-300">Default-HAZ (Min./Woche)</span>
            <input
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
              defaultValue={initial.defaultHazMinutesPerWeek}
              type="number"
              min={60}
              name="defaultHazMinutesPerWeek"
              required
            />
          </label>
        </div>
        <button
          disabled={pending}
          className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
          type="submit"
        >
          Stammdaten speichern
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {initial.deletedAt ? (
          <button
            disabled={pending}
            onClick={runReactivate}
            className="rounded-md border border-emerald-700 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-900/30 disabled:opacity-50"
            type="button"
          >
            Reaktivieren
          </button>
        ) : (
          <button
            disabled={pending}
            onClick={runDeactivate}
            className="rounded-md border border-rose-700 px-4 py-2 text-sm text-rose-200 hover:bg-rose-900/30 disabled:opacity-50"
            type="button"
          >
            Deaktivieren
          </button>
        )}
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
    </div>
  );
}
