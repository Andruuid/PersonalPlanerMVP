import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { logDebug, logError } from "@/lib/logging";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeClient(): PrismaClient {
  const envUrl = process.env.DATABASE_URL?.trim();
  const isProd = process.env.NODE_ENV === "production";
  const runtime = process.env.NETLIFY ? "netlify" : "unknown-host";
  const isLibsql = (envUrl ?? "").startsWith("libsql://");
  logDebug("db:init", "Creating Prisma client", {
    runtime,
    isProd,
    hasDatabaseUrl: Boolean(envUrl),
    isLibsql,
  });

  if (isProd && !envUrl) {
    logError("db:init", "Missing DATABASE_URL in production", {
      runtime,
      nodeEnv: process.env.NODE_ENV,
    });
    throw new Error(
      "DATABASE_URL is not set. In production you must set it on the host (e.g. Netlify env) to your libsql:// URL.",
    );
  }

  const url = envUrl ?? "file:./prisma/dev.db";

  if (url.startsWith("libsql://")) {
    const token = process.env.DATABASE_AUTH_TOKEN?.trim();
    if (!token) {
      logError("db:init", "Missing DATABASE_AUTH_TOKEN for libsql URL", {
        runtime,
        nodeEnv: process.env.NODE_ENV,
        dbProtocol: "libsql",
      });
      throw new Error(
        "DATABASE_AUTH_TOKEN is required when DATABASE_URL is a libsql:// URL (Turso).",
      );
    }
  }

  const adapter = new PrismaLibSql({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/** Reuse one client per runtime (dev HMR + warm serverless) to avoid extra Turso handshakes. */
export const prisma = globalForPrisma.prisma ?? makeClient();
globalForPrisma.prisma = prisma;
