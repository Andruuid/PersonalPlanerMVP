"use client";

import { useActionState } from "react";
import { createTenantAction } from "@/server/system-admin/tenants";
import type { ActionResult } from "@/server/_shared";

const initialState: ActionResult<{ tenantId: string; temporaryPassword: string }> = {
  ok: false,
  error: "",
};

export function NewTenantForm() {
  const [state, formAction, pending] = useActionState(createTenantAction, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Name</span>
          <input
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            name="name"
            required
            placeholder="Demo Betrieb 2"
          />
          {state.ok === false && state.fieldErrors?.name ? (
            <p className="text-xs text-rose-300">{state.fieldErrors.name}</p>
          ) : null}
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Slug</span>
          <input
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            name="slug"
            required
            placeholder="demo-betrieb-2"
          />
          {state.ok === false && state.fieldErrors?.slug ? (
            <p className="text-xs text-rose-300">{state.fieldErrors.slug}</p>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Default-Sollzeit (Min./Woche)</span>
          <input
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            type="number"
            name="defaultWeeklyTargetMinutes"
            min={60}
            defaultValue={2520}
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Default-HAZ (Min./Woche)</span>
          <input
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            type="number"
            name="defaultHazMinutesPerWeek"
            min={60}
            defaultValue={2700}
            required
          />
          {state.ok === false && state.fieldErrors?.defaultHazMinutesPerWeek ? (
            <p className="text-xs text-rose-300">{state.fieldErrors.defaultHazMinutesPerWeek}</p>
          ) : null}
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="text-slate-300">Initiale Kunden-Admin E-Mail</span>
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
          type="email"
          name="adminEmail"
          required
          placeholder="admin@demo-betrieb.ch"
        />
        {state.ok === false && state.fieldErrors?.adminEmail ? (
          <p className="text-xs text-rose-300">{state.fieldErrors.adminEmail}</p>
        ) : null}
      </label>

      {state.ok === false && state.error ? (
        <p className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {state.error}
        </p>
      ) : null}

      {state.ok === true && state.data ? (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          <p>Mandant wurde erstellt.</p>
          <p>
            Temporäres Passwort:{" "}
            <span className="font-mono font-semibold">{state.data.temporaryPassword}</span>
          </p>
          <p className="text-xs text-emerald-300">
            Dieses Passwort wird im MVP nur hier angezeigt.
          </p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
      >
        {pending ? "Erstelle Mandant..." : "Mandant erstellen"}
      </button>
    </form>
  );
}
