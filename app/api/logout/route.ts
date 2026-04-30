import { NextResponse } from "next/server";

function parseRelativeRedirect(payload: unknown): string {
  if (
    payload &&
    typeof payload === "object" &&
    "url" in payload &&
    typeof payload.url === "string" &&
    payload.url.startsWith("/")
  ) {
    return payload.url;
  }
  return "/login";
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const cookie = request.headers.get("cookie") ?? "";

  const csrfResponse = await fetch(`${origin}/api/auth/csrf`, {
    cache: "no-store",
    headers: { cookie },
  });
  if (!csrfResponse.ok) {
    return NextResponse.json({ error: "csrf-fetch-failed" }, { status: 502 });
  }

  const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };
  const csrfToken = csrfPayload.csrfToken?.trim();
  if (!csrfToken) {
    return NextResponse.json({ error: "csrf-missing" }, { status: 502 });
  }

  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: "/login",
    json: "true",
  });

  const signOutResponse = await fetch(`${origin}/api/auth/signout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1",
      cookie,
    },
    body,
    redirect: "manual",
  });

  if (!signOutResponse.ok) {
    return NextResponse.json({ error: "server-signout-failed" }, { status: 502 });
  }

  const payload = await signOutResponse.json().catch(() => null);
  const targetUrl = parseRelativeRedirect(payload);
  const response = NextResponse.json({ url: targetUrl });

  const getSetCookie = (
    signOutResponse.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  if (typeof getSetCookie === "function") {
    const setCookies = getSetCookie.call(signOutResponse.headers);
    for (const cookieValue of setCookies) {
      response.headers.append("set-cookie", cookieValue);
    }
  } else {
    const setCookie = signOutResponse.headers.get("set-cookie");
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }
  }

  return response;
}
