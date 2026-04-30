import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

export async function POST() {
  await signOut({ redirect: false });

  const response = NextResponse.json({ url: "/login" });
  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure: name.startsWith("__Secure-"),
      sameSite: "lax",
    });
  }
  return response;
}
