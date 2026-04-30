import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { homePathForRole } from "@/lib/auth-home-path";
import { logDebug } from "@/lib/logging";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth", "/forbidden"];
const SELECT_TENANT_PATH = "/select-tenant";
const ADMIN_PATHS = [
  "/dashboard",
  "/planning",
  "/users",
  "/employees",
  "/services",
  "/absences",
  "/accounts",
  "/settings",
  "/compensation-cases",
  "/privacy",
  "/audit",
];
const EMPLOYEE_PATHS = ["/my-week", "/my-requests", "/my-accounts"];
const SYSTEM_ADMIN_PATHS = ["/system-admin"];

function pathMatches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  // Belt-and-braces: even if the matcher exclusion is honored by the host's
  // adapter, short-circuit the auth wrapper for routes that mutate the
  // session cookie. Reading req.auth here would re-touch the JWT on Netlify
  // and re-emit a session Set-Cookie that overwrites the route handler's
  // clearing Set-Cookie ("logout seems ignored" symptom).
  if (pathname === "/api/logout" || pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const role = req.auth?.user?.role ?? "ANON";
  const tenantId = req.auth?.user?.tenantId;
  const pendingTenantSelection = Boolean(req.auth?.user?.pendingTenantSelection);
  const hasStaleSessionClaims =
    Boolean(req.auth) &&
    !pendingTenantSelection &&
    (role === "ADMIN" || role === "EMPLOYEE") &&
    (typeof tenantId !== "string" || tenantId.trim().length === 0);

  const loginUrl = new URL("/login", nextUrl);
  if (pathname !== "/login") {
    loginUrl.searchParams.set("callbackUrl", pathname);
  }
  if (hasStaleSessionClaims) {
    loginUrl.searchParams.set("reason", "session_stale");
  }

  if (pathMatches(pathname, PUBLIC_PATHS)) {
    if (pathname === "/login" && req.auth && !hasStaleSessionClaims) {
      const target = pendingTenantSelection
        ? SELECT_TENANT_PATH
        : homePathForRole(role);
      logDebug("proxy", "Redirect authenticated user from /login", {
        pathname,
        role,
        target,
      });
      return NextResponse.redirect(new URL(target, nextUrl));
    }
    if (pathname === "/signup" && req.auth && !hasStaleSessionClaims) {
      const target = pendingTenantSelection
        ? SELECT_TENANT_PATH
        : homePathForRole(role);
      logDebug("proxy", "Redirect authenticated user from /signup", {
        pathname,
        role,
        target,
      });
      return NextResponse.redirect(new URL(target, nextUrl));
    }
    return NextResponse.next();
  }

  if (hasStaleSessionClaims) {
    logDebug("proxy", "Redirect stale session to /login", {
      pathname,
      role,
      reason: "session_stale",
      target: "/login",
    });
    return NextResponse.redirect(loginUrl);
  }

  if (!req.auth) {
    logDebug("proxy", "Redirect anonymous user to /login", {
      pathname,
      target: "/login",
    });
    return NextResponse.redirect(loginUrl);
  }

  if (pendingTenantSelection && pathname !== SELECT_TENANT_PATH) {
    logDebug("proxy", "Redirect pending tenant selection to picker", {
      pathname,
      role,
      target: SELECT_TENANT_PATH,
    });
    return NextResponse.redirect(new URL(SELECT_TENANT_PATH, nextUrl));
  }

  if (!pendingTenantSelection && pathname === SELECT_TENANT_PATH) {
    const target = homePathForRole(role);
    logDebug("proxy", "Redirect resolved tenant session away from picker", {
      pathname,
      role,
      target,
    });
    return NextResponse.redirect(new URL(target, nextUrl));
  }

  if (pathMatches(pathname, ADMIN_PATHS) && role !== "ADMIN") {
    const target = role === "EMPLOYEE" ? "/my-week" : "/forbidden";
    logDebug("proxy", "Redirect non-admin from admin path", {
      pathname,
      role,
      target,
    });
    return NextResponse.redirect(new URL(target, nextUrl));
  }

  if (pathMatches(pathname, SYSTEM_ADMIN_PATHS) && role !== "SYSTEM_ADMIN") {
    logDebug("proxy", "Redirect non-system-admin from system-admin path", {
      pathname,
      role,
      target: "/forbidden",
    });
    return NextResponse.redirect(new URL("/forbidden", nextUrl));
  }

  // Admins are allowed to preview the employee view (Mitarbeiter-Ansicht
  // toggle); only block other roles from employee paths.
  if (
    pathMatches(pathname, EMPLOYEE_PATHS) &&
    role !== "EMPLOYEE" &&
    role !== "ADMIN"
  ) {
    logDebug("proxy", "Redirect non-employee role from employee path", {
      pathname,
      role,
      target: "/forbidden",
    });
    return NextResponse.redirect(new URL("/forbidden", nextUrl));
  }

  if (pathname === "/") {
    const target = pendingTenantSelection ? SELECT_TENANT_PATH : homePathForRole(role);
    logDebug("proxy", "Redirect root path by role", { role, target });
    return NextResponse.redirect(new URL(target, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  // Keep Auth.js routes AND the wrapping `/api/logout` route out of proxy
  // execution. On some runtimes (notably Netlify, where the proxy runs as an
  // Edge Function and the route handler runs as a separate Lambda), letting
  // the auth-aware proxy touch a logout request causes its session-related
  // Set-Cookie to clobber the handler's clearing Set-Cookie — the session
  // cookie survives the round-trip and "logout seems ignored." Any new auth
  // route that mutates the session cookie must be added to this exclusion.
  matcher: [
    "/((?!api/auth|api/logout|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
