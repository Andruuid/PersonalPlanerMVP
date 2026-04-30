import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

const CSRF_COOKIE_NAMES = [
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
] as const;

const CALLBACK_COOKIE_NAMES = [
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
] as const;

const AUTH_COOKIE_NAME_PATTERN =
  /^(?:__Secure-|__Host-)?(?:next-auth|authjs)\.(?:session-token|csrf-token|callback-url)(?:\.\d+)?$/;
const LOGOUT_DEBUG_ENABLED =
  process.env.AUTH_LOGOUT_DEBUG === "1" ||
  process.env.AUTH_LOGOUT_DEBUG === "true";

function isCallbackCookie(name: string): boolean {
  return name.includes(".callback-url");
}

function isSecureCookie(name: string): boolean {
  return name.startsWith("__Secure-") || name.startsWith("__Host-");
}

async function clearAuthCookies(request: NextRequest) {
  // Channel 1: write via next/headers cookies() - Next.js request-mutation API.
  const cookieStore = await cookies();
  const cookieNamesToClear = new Set<string>([
    ...SESSION_COOKIE_NAMES,
    ...CSRF_COOKIE_NAMES,
    ...CALLBACK_COOKIE_NAMES,
  ]);
  for (const cookie of cookieStore.getAll()) {
    if (AUTH_COOKIE_NAME_PATTERN.test(cookie.name)) {
      cookieNamesToClear.add(cookie.name);
    }
  }

  if (LOGOUT_DEBUG_ENABLED) {
    console.info("[auth:logout] cookies selected for clearing", {
      cookieCount: cookieNamesToClear.size,
      cookies: [...cookieNamesToClear],
    });
  }

  for (const name of cookieNamesToClear) {
    cookieStore.delete(name);
  }

  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });

  // Channel 2: write directly on the outgoing response. Belt-and-braces in
  // case the adapter on the host (notably Netlify) doesn't reflect channel 1
  // mutations onto a manually-constructed NextResponse.
  for (const name of cookieNamesToClear) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: !isCallbackCookie(name),
      secure: isSecureCookie(name),
      sameSite: "lax",
    });
  }

  if (LOGOUT_DEBUG_ENABLED) {
    console.info("[auth:logout] clear response prepared", {
      cookieCount: cookieNamesToClear.size,
    });
  }

  return response;
}

export async function POST(request: NextRequest) {
  return clearAuthCookies(request);
}
