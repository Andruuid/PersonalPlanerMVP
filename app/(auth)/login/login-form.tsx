"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

interface Props {
  callbackUrl?: string;
}

const initialState: LoginState = { ok: false };

export function LoginForm({ callbackUrl }: Props) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? ""} />

      <div className="space-y-2">
        <Label htmlFor="email">E-Mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="admin@demo.ch"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Anmeldung läuft..." : "Anmelden"}
      </Button>

      <p className="pt-2 text-center text-xs text-neutral-500">
        Neue Betriebe werden durch den System-Admin angelegt.
      </p>

      <p className="text-center text-xs text-neutral-500">
        Demo nach Seed:&nbsp;
        <span className="font-medium text-neutral-700">admin@demo.ch</span> /
        admin123
        <br />
        <span className="font-medium text-neutral-700">anna.keller@demo.ch</span>{" "}
        / demo123
        <br />
        <span className="font-medium text-neutral-700">system@platform.local</span>{" "}
        / system123
      </p>
    </form>
  );
}
