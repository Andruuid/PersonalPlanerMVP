import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/api/auth"];
const ADMIN_PATHS = [
  "/dashboard",
  "/planning",
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

  if (pathMatches(pathname, PUBLIC_PATHS)) {
    if (pathname === "/login" && req.auth) {
      const role = req.auth.user?.role;
      const target = role === "ADMIN" ? "/dashboard" : "/my-week";
      return NextResponse.redirect(new URL(target, nextUrl));
    }
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = new URL("/login", nextUrl);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  const role = req.auth.user?.role;

  if (pathMatches(pathname, ADMIN_PATHS) && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/my-week", nextUrl));
  }

  // Admins are allowed to preview the employee view (Mitarbeiter-Ansicht
  // toggle); only block other roles from employee paths.
  if (
    pathMatches(pathname, EMPLOYEE_PATHS) &&
    role !== "EMPLOYEE" &&
    role !== "ADMIN"
  ) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  if (pathname === "/") {
    const target = role === "ADMIN" ? "/dashboard" : "/my-week";
    return NextResponse.redirect(new URL(target, nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
