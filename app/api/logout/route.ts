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

const AUTH_COOKIE_BASE_NAMES = [
  ...SESSION_COOKIE_NAMES,
  ...CSRF_COOKIE_NAMES,
  ...CALLBACK_COOKIE_NAMES,
] as const;
const MAX_COOKIE_CHUNKS_TO_CLEAR = 10;
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

function isHttpsRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  return (
    request.nextUrl.protocol === "https:" ||
    forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https"
  );
}

function authCookieNamesToClear(): Set<string> {
  const names = new Set<string>(AUTH_COOKIE_BASE_NAMES);
  for (const baseName of SESSION_COOKIE_NAMES) {
    for (let index = 0; index <= MAX_COOKIE_CHUNKS_TO_CLEAR; index++) {
      names.add(`${baseName}.${index}`);
    }
  }
  return names;
}

async function clearAuthCookies(request: NextRequest) {
  // Channel 1: write via next/headers cookies() - Next.js request-mutation API.
  const cookieStore = await cookies();
  const cookieNamesToClear = authCookieNamesToClear();
  const secureResponseCookies = isHttpsRequest(request);
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

  const response = NextResponse.redirect(
    new URL("/login?loggedOut=1", request.url),
    {
      status: 303,
      headers: {
        // Clear-Site-Data instructs the browser to drop cookies & web storage
        // for this origin. This works at a different layer than Set-Cookie,
        // so it survives the next-auth#12909 ordering bug on Netlify where a
        // clearing Set-Cookie can be re-emitted before the session-refresh
        // Set-Cookie and the browser ends up keeping the session.
        "Clear-Site-Data": '"cookies", "storage"',
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );

  // Channel 2: write directly on the outgoing response. Belt-and-braces in
  // case the adapter on the host (notably Netlify) doesn't reflect channel 1
  // mutations onto a manually-constructed NextResponse, and for browsers
  // that ignore Clear-Site-Data (older Safari).
  for (const name of cookieNamesToClear) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      expires: new Date(0),
      httpOnly: !isCallbackCookie(name),
      secure: secureResponseCookies || isSecureCookie(name),
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
