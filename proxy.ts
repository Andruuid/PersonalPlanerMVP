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

function pathMatches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
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
  // Keep Auth.js routes out of proxy execution.
  // On some runtimes (e.g. Netlify), running auth middleware on
  // `/api/auth/signout` can lead to conflicting Set-Cookie headers and a
  // "logout seems ignored" effect.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
