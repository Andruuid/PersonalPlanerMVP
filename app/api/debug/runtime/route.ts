import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const logLevel = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
  if (logLevel !== "debug") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const diagnostics: Record<string, unknown> = {
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    logLevel: process.env.LOG_LEVEL ?? "(unset)",
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
    hasDatabaseAuthToken: Boolean(process.env.DATABASE_AUTH_TOKEN?.trim()),
    hasAuthSecret: Boolean(process.env.AUTH_SECRET?.trim()),
  };

  try {
    const session = await auth();
    diagnostics.session = {
      hasSession: Boolean(session),
      hasUser: Boolean(session?.user),
      role: session?.user?.role ?? null,
      tenantIdPresent: Boolean(session?.user?.tenantId),
    };
  } catch (err) {
    diagnostics.sessionError =
      err instanceof Error ? err.message : "Unknown session error";
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    diagnostics.dbPing = "ok";
  } catch (err) {
    diagnostics.dbPing = "failed";
    diagnostics.dbPingError =
      err instanceof Error ? err.message : "Unknown DB ping error";
  }

  try {
    const userCount = await prisma.user.count();
    diagnostics.userCount = userCount;
  } catch (err) {
    diagnostics.userCountError =
      err instanceof Error ? err.message : "Unknown user-count error";
  }

  return NextResponse.json({ ok: true, diagnostics });
}
