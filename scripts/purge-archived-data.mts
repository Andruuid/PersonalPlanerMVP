/**
 * Purge soft-deleted archived data whose retention window has expired.
 *
 * Usage:
 *   npm run db:purge:archived
 *   npm run db:purge:archived -- --dry-run
 */
import { config as loadDotenv } from "dotenv";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { purgeArchivedData } from "../lib/archive/purge";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const dryRun = process.argv.includes("--dry-run");

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  authToken: process.env.DATABASE_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter, log: ["error"] });

async function main() {
  const result = await purgeArchivedData(prisma, { dryRun });
  console.log(
    JSON.stringify(
      {
        mode: result.dryRun ? "dry-run" : "delete",
        asOf: result.asOf.toISOString(),
        candidates: result.candidates,
        deleted: result.deleted,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error("Archived purge failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
