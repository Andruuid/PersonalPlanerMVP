"use client";

import { LogOut, UserCircle2 } from "lucide-react";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { switchTenantAction } from "./actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  email: string;
  canSwitchTenant: boolean;
}

const REQUEST_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function forceServerSignOut(): Promise<string> {
  const csrfResponse = await fetchWithTimeout("/api/auth/csrf", {
    cache: "no-store",
  });
  if (!csrfResponse.ok) {
    throw new Error("csrf-fetch-failed");
  }

  const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };
  const csrfToken = csrfPayload.csrfToken?.trim();
  if (!csrfToken) {
    throw new Error("csrf-missing");
  }

  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: "/login",
    json: "true",
  });

  const signoutResponse = await fetchWithTimeout("/api/auth/signout", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
    },
    body,
  });

  if (!signoutResponse.ok) {
    throw new Error("server-signout-failed");
  }

  const payload = (await signoutResponse.json().catch(() => null)) as
    | { url?: string }
    | null;
  return payload?.url && payload.url.startsWith("/")
    ? payload.url
    : "/login";
}

async function signOutViaAppRoute(): Promise<string> {
  const response = await fetchWithTimeout("/api/logout", {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("app-logout-failed");
  }

  const payload = (await response.json().catch(() => null)) as
    | { url?: string }
    | null;
  return payload?.url && payload.url.startsWith("/")
    ? payload.url
    : "/login";
}

export function UserMenu({ email, canSwitchTenant }: UserMenuProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);

    let targetUrl = "/login";
    try {
      try {
        targetUrl = await signOutViaAppRoute();
      } catch {
        await signOut({ redirect: true, callbackUrl: "/login" });
        return;
      }

      // Verify that the session is really gone. In production, a failed sign-out
      // previously looked like a silent dashboard reload.
      const sessionResponse = await fetchWithTimeout("/api/auth/session", {
        cache: "no-store",
      });
      if (sessionResponse.ok) {
        const sessionPayload = (await sessionResponse.json()) as {
          user?: unknown;
        } | null;
        if (sessionPayload?.user) {
          targetUrl = await forceServerSignOut();
        }
      }
    } catch {
      try {
        targetUrl = await forceServerSignOut();
      } catch {
        toast.error(
          "Abmelden fehlgeschlagen. Bitte Seite neu laden und erneut versuchen.",
        );
        setIsSigningOut(false);
        return;
      }
    }

    window.location.replace(targetUrl);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2 rounded-full px-2 text-sm text-neutral-700"
          aria-label="Benutzermenü"
        >
          <UserCircle2 className="h-5 w-5" />
          <span className="hidden max-w-[160px] truncate sm:inline">{email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {canSwitchTenant ? (
          <DropdownMenuItem asChild>
            <form action={switchTenantAction} className="w-full">
              <button type="submit" className="w-full text-left">
                Mandant wechseln
              </button>
            </form>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleSignOut();
          }}
          disabled={isSigningOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {isSigningOut ? "Abmelden..." : "Abmelden"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
