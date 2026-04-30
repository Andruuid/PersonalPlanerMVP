import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { logDebug } from "@/lib/logging";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth"];
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

  if (pathMatches(pathname, PUBLIC_PATHS)) {
    if (pathname === "/login" && req.auth) {
      const target = role === "ADMIN" ? "/dashboard" : "/my-week";
      logDebug("proxy", "Redirect authenticated user from /login", {
        pathname,
        role,
        target,
      });
      return NextResponse.redirect(new URL(target, nextUrl));
    }
    if (pathname === "/signup" && req.auth) {
      const target = role === "ADMIN" ? "/dashboard" : "/my-week";
      logDebug("proxy", "Redirect authenticated user from /signup", {
        pathname,
        role,
        target,
      });
      return NextResponse.redirect(new URL(target, nextUrl));
    }
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = new URL("/login", nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    logDebug("proxy", "Redirect anonymous user to /login", {
      pathname,
      target: "/login",
    });
    return NextResponse.redirect(url);
  }

  if (pathMatches(pathname, ADMIN_PATHS) && role !== "ADMIN") {
    logDebug("proxy", "Redirect non-admin from admin path", {
      pathname,
      role,
      target: "/my-week",
    });
    return NextResponse.redirect(new URL("/my-week", nextUrl));
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
      target: "/login",
    });
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  if (pathname === "/") {
    const target = role === "ADMIN" ? "/dashboard" : "/my-week";
    logDebug("proxy", "Redirect root path by role", { role, target });
    return NextResponse.redirect(new URL(target, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
