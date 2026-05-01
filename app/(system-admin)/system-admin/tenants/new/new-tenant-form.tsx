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
    <form action={formAction} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-neutral-700">Name</span>
          <input
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            name="name"
            required
            placeholder="Demo Betrieb 2"
          />
          {state.ok === false && state.fieldErrors?.name ? (
            <p className="text-xs text-rose-700">{state.fieldErrors.name}</p>
          ) : null}
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-700">Slug</span>
          <input
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            name="slug"
            required
            placeholder="demo-betrieb-2"
          />
          {state.ok === false && state.fieldErrors?.slug ? (
            <p className="text-xs text-rose-700">{state.fieldErrors.slug}</p>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-neutral-700">Default-Sollzeit (Min./Woche)</span>
          <input
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            type="number"
            name="defaultWeeklyTargetMinutes"
            min={60}
            defaultValue={2520}
            required
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-neutral-700">Default-HAZ (Min./Woche)</span>
          <input
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
            type="number"
            name="defaultHazMinutesPerWeek"
            min={60}
            defaultValue={2700}
            required
          />
          {state.ok === false && state.fieldErrors?.defaultHazMinutesPerWeek ? (
            <p className="text-xs text-rose-700">{state.fieldErrors.defaultHazMinutesPerWeek}</p>
          ) : null}
        </label>
      </div>

      <label className="space-y-1 text-sm">
        <span className="text-neutral-700">Initiale Kunden-Admin E-Mail</span>
        <input
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
          type="email"
          name="adminEmail"
          required
          placeholder="admin@demo-betrieb.ch"
        />
        {state.ok === false && state.fieldErrors?.adminEmail ? (
          <p className="text-xs text-rose-700">{state.fieldErrors.adminEmail}</p>
        ) : null}
      </label>

      {state.ok === false && state.error ? (
        <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {state.error}
        </p>
      ) : null}

      {state.ok === true && state.data ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p>Mandant wurde erstellt.</p>
          <p>
            Temporäres Passwort:{" "}
            <span className="font-mono font-semibold">{state.data.temporaryPassword}</span>
          </p>
          <p className="text-xs text-emerald-700">
            Dieses Passwort wird im MVP nur hier angezeigt.
          </p>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Erstelle Mandant..." : "Mandant erstellen"}
      </button>
    </form>
  );
}
