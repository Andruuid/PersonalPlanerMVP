import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";

const LOGOUT_DEBUG_ENABLED =
  process.env.AUTH_LOGOUT_DEBUG === "1" ||
  process.env.AUTH_LOGOUT_DEBUG === "true";

function shouldLogLogout(request: NextRequest): boolean {
  if (!LOGOUT_DEBUG_ENABLED) return false;
  return request.nextUrl.pathname.endsWith("/signout");
}

function hasAuthCookieClearingHeader(setCookieHeader: string | null): boolean {
  if (!setCookieHeader) return false;
  const header = setCookieHeader.toLowerCase();
  return (
    (header.includes("authjs.session-token=") ||
      header.includes("next-auth.session-token=") ||
      header.includes("__secure-authjs.session-token=") ||
      header.includes("__secure-next-auth.session-token=")) &&
    (header.includes("max-age=0") || header.includes("expires="))
  );
}

function logLogout(message: string, details: Record<string, unknown>): void {
  console.info(`[auth:logout] ${message}`, details);
}

export async function GET(request: NextRequest) {
  const response = await handlers.GET(request);
  if (shouldLogLogout(request)) {
    logLogout("GET signout response", {
      host: request.headers.get("host"),
      forwardedHost: request.headers.get("x-forwarded-host"),
      forwardedProto: request.headers.get("x-forwarded-proto"),
      status: response.status,
      hasAuthCookieClear: hasAuthCookieClearingHeader(
        response.headers.get("set-cookie"),
      ),
    });
  }
  return response;
}

export async function POST(request: NextRequest) {
  const response = await handlers.POST(request);
  if (shouldLogLogout(request)) {
    logLogout("POST signout response", {
      host: request.headers.get("host"),
      forwardedHost: request.headers.get("x-forwarded-host"),
      forwardedProto: request.headers.get("x-forwarded-proto"),
      status: response.status,
      hasAuthCookieClear: hasAuthCookieClearingHeader(
        response.headers.get("set-cookie"),
      ),
    });
  }
  return response;
}
