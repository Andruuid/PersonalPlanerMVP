import { cookies } from "next/headers";
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

export async function POST() {
  // Channel 1: write via next/headers cookies() — Next.js request-mutation API.
  const cookieStore = await cookies();
  for (const name of [
    ...SESSION_COOKIE_NAMES,
    ...CSRF_COOKIE_NAMES,
    ...CALLBACK_COOKIE_NAMES,
  ]) {
    cookieStore.delete(name);
  }

  const response = NextResponse.json({ url: "/login" });

  // Channel 2: write directly on the outgoing response. Belt-and-braces in
  // case the adapter on the host (notably Netlify) doesn't reflect channel 1
  // mutations onto a manually-constructed NextResponse.
  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: name.startsWith("__Secure-"),
      sameSite: "lax",
    });
  }
  for (const name of CSRF_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: name.startsWith("__Host-"),
      sameSite: "lax",
    });
  }
  for (const name of CALLBACK_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: false,
      secure: name.startsWith("__Secure-"),
      sameSite: "lax",
    });
  }

  return response;
}
