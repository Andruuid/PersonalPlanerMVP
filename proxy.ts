import { getToken, type JWT } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { homePathForRole } from "@/lib/auth-home-path";
import { logDebug } from "@/lib/logging";
import type { Role } from "@/lib/generated/prisma/enums";

const PUBLIC_PATHS = ["/login", "/api/auth", "/forbidden"];
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
const AUTH_MUTATION_PATHS = ["/api/logout", "/api/auth"] as const;

function pathMatches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isAuthMutationPath(pathname: string): boolean {
  return pathMatches(pathname, AUTH_MUTATION_PATHS);
}

function isHttpsRequest(req: NextRequest): boolean {
  if (req.nextUrl.protocol === "https:") return true;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  return forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https";
}

async function readSessionToken(req: NextRequest): Promise<JWT | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const secureCookie = isHttpsRequest(req);
  // Try the protocol-appropriate cookie name first, then fall back to the
  // other variant. Robust against deployments where x-forwarded-proto is
  // missing or wrong, and against cookies left over from a previous mode.
  try {
    const primary = await getToken({ req, secret, secureCookie });
    if (primary) return primary;
  } catch {
    /* fall through to fallback */
  }
  try {
    const fallback = await getToken({
      req,
      secret,
      secureCookie: !secureCookie,
    });
    if (fallback) return fallback;
  } catch {
    /* both reads failed */
  }
  return null;
}

async function proxyImpl(req: NextRequest): Promise<NextResponse> {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  const token = await readSessionToken(req);
  const isAuthenticated = Boolean(token);
  const role: Role | "ANON" = token?.role ?? "ANON";
  const tenantId = token?.tenantId ?? null;
  const pendingTenantSelection = Boolean(token?.pendingTenantSelection);
  const hasStaleSessionClaims =
    isAuthenticated &&
    !pendingTenantSelection &&
    (role === "ADMIN" || role === "EMPLOYEE") &&
    (typeof tenantId !== "string" || tenantId.trim().length === 0);

  const intentLoggedOut = nextUrl.searchParams.get("loggedOut") === "1";

  const loginUrl = new URL("/login", nextUrl);
  if (pathname !== "/login") {
    loginUrl.searchParams.set("callbackUrl", pathname);
  }
  if (hasStaleSessionClaims) {
    loginUrl.searchParams.set("reason", "session_stale");
  }

  if (pathMatches(pathname, PUBLIC_PATHS)) {
    if (
      pathname === "/login" &&
      isAuthenticated &&
      !hasStaleSessionClaims &&
      !intentLoggedOut
    ) {
      const target = pendingTenantSelection
        ? SELECT_TENANT_PATH
        : homePathForRole(role as Role);
      logDebug("proxy", "Redirect authenticated user from /login", {
        pathname,
        role,
        target,
      });
      return NextResponse.redirect(new URL(target, nextUrl));
    }
    if (
      pathname === "/signup" &&
      isAuthenticated &&
      !hasStaleSessionClaims &&
      !intentLoggedOut
    ) {
      const target = pendingTenantSelection
        ? SELECT_TENANT_PATH
        : homePathForRole(role as Role);
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

  if (!isAuthenticated) {
    logDebug("proxy", "Redirect anonymous user to /login", {
      pathname,
      target: "/login",
    });
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/signup") {
    if (role !== "SYSTEM_ADMIN") {
      logDebug("proxy", "Redirect non-system-admin from /signup", {
        pathname,
        role,
        target: "/forbidden",
      });
      return NextResponse.redirect(new URL("/forbidden", nextUrl));
    }
    return NextResponse.redirect(new URL("/system-admin/tenants/new", nextUrl));
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
    const target = homePathForRole(role as Role);
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
    const target = pendingTenantSelection
      ? SELECT_TENANT_PATH
      : homePathForRole(role as Role);
    logDebug("proxy", "Redirect root path by role", { role, target });
    return NextResponse.redirect(new URL(target, nextUrl));
  }

  return NextResponse.next();
}

export default async function proxy(
  req: NextRequest,
): Promise<NextResponse> {
  // Auth-mutating routes (/api/logout, /api/auth/*) MUST bypass the proxy
  // entirely — even a read-only token check could race with the route's
  // own Set-Cookie writes on Netlify's split runtime.
  if (isAuthMutationPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return proxyImpl(req);
}

export const config = {
  // Belt-and-braces: the matcher still excludes auth-mutating routes from
  // proxy execution, in addition to the early-return inside `proxy()`.
  matcher: [
    "/((?!api/auth|api/logout|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
