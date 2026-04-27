import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeClient(): PrismaClient {
  const envUrl = process.env.DATABASE_URL?.trim();
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !envUrl) {
    throw new Error(
      "DATABASE_URL is not set. In production you must set it on the host (e.g. Netlify env) to your libsql:// URL.",
    );
  }

  const url = envUrl ?? "file:./prisma/dev.db";

  if (url.startsWith("libsql://")) {
    const token = process.env.DATABASE_AUTH_TOKEN?.trim();
    if (!token) {
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

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
