"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createTenantAction,
} from "@/server/onboarding";
import type { ActionResult } from "@/server/_shared";

const initialState: ActionResult = { ok: false, error: "" };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    createTenantAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="businessName">Betriebsname</Label>
        <Input
          id="businessName"
          name="businessName"
          type="text"
          autoComplete="organization"
          required
          placeholder="Muster AG"
        />
        {state.ok === false && state.fieldErrors?.businessName ? (
          <p className="text-xs text-rose-700">{state.fieldErrors.businessName}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">Betriebskennung (Kurzname)</Label>
        <Input
          id="slug"
          name="slug"
          type="text"
          autoComplete="off"
          required
          placeholder="mein-betrieb"
          pattern="[a-zA-Z0-9\-]+"
          title="Nur Buchstaben, Zahlen und Bindestriche"
        />
        <p className="text-xs text-neutral-500">
          URL-tauglich: Kleinbuchstaben, Zahlen, Bindestriche (wird normalisiert).
        </p>
        {state.ok === false && state.fieldErrors?.slug ? (
          <p className="text-xs text-rose-700">{state.fieldErrors.slug}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="adminEmail">Admin-E-Mail</Label>
        <Input
          id="adminEmail"
          name="adminEmail"
          type="email"
          autoComplete="email"
          required
          placeholder="admin@firma.ch"
        />
        {state.ok === false && state.fieldErrors?.adminEmail ? (
          <p className="text-xs text-rose-700">{state.fieldErrors.adminEmail}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="adminPassword">Admin-Passwort</Label>
        <Input
          id="adminPassword"
          name="adminPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
        />
        {state.ok === false && state.fieldErrors?.adminPassword ? (
          <p className="text-xs text-rose-700">
            {state.fieldErrors.adminPassword}
          </p>
        ) : null}
      </div>

      {state.ok === false && state.error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Wird angelegt..." : "Betrieb registrieren"}
      </Button>

      <p className="pt-2 text-center text-xs text-neutral-500">
        <Link
          href="/login"
          className="font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
        >
          Bereits registriert? Anmelden
        </Link>
      </p>
    </form>
  );
}
