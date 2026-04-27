/**
 * Apply Prisma migration SQL files to a remote libSQL/Turso database.
 *
 * Why this exists:
 * - Prisma 7's schema engine does not accept `libsql://` URLs.
 * - Prisma's official Turso workflow uses `turso db shell <db> < migration.sql`,
 *   but the Turso CLI has no Windows binary.
 *
 * What this does:
 * - Reads `DATABASE_URL` and `DATABASE_AUTH_TOKEN` from the environment.
 * - Lists folders under `prisma/migrations/` in chronological order.
 * - Tracks applied migrations in a `_prisma_libsql_migrations` table on the
 *   target DB so it is safe to re-run.
 * - Applies any pending migration SQL via `@libsql/client`.
 *
 * Usage:
 *   $env:DATABASE_URL="libsql://..."
 *   $env:DATABASE_AUTH_TOKEN="..."
 *   npm run db:push:libsql
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createClient } from "@libsql/client";

// Load .env.local first (Next.js convention), then .env as fallback.
loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url || !url.startsWith("libsql://")) {
  console.error(
    "DATABASE_URL must be set to a libsql:// URL (got: " + (url ?? "<undefined>") + ")",
  );
  process.exit(1);
}
if (!authToken) {
  console.error("DATABASE_AUTH_TOKEN must be set for libSQL/Turso connections");
  process.exit(1);
}

const migrationsDir = "prisma/migrations";
if (!existsSync(migrationsDir)) {
  console.error(`Missing directory: ${migrationsDir}`);
  process.exit(1);
}

const client = createClient({ url, authToken });

async function main() {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS _prisma_libsql_migrations (
      name TEXT PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );

  const applied = new Set(
    (
      await client.execute("SELECT name FROM _prisma_libsql_migrations")
    ).rows.map((row) => String(row.name)),
  );

  const folders = readdirSync(migrationsDir)
    .filter((entry) => statSync(join(migrationsDir, entry)).isDirectory())
    .sort();

  let appliedCount = 0;

  for (const folder of folders) {
    if (applied.has(folder)) {
      console.log(`✓ ${folder} (already applied)`);
      continue;
    }

    const sqlPath = join(migrationsDir, folder, "migration.sql");
    if (!existsSync(sqlPath)) {
      console.warn(`! ${folder} — no migration.sql found, skipping`);
      continue;
    }

    const sql = readFileSync(sqlPath, "utf8");
    process.stdout.write(`→ Applying ${folder}... `);

    await client.executeMultiple(sql);
    await client.execute({
      sql: "INSERT INTO _prisma_libsql_migrations (name) VALUES (?)",
      args: [folder],
    });

    appliedCount += 1;
    console.log("done");
  }

  if (appliedCount === 0) {
    console.log("\nDatabase is already up to date.");
  } else {
    console.log(`\nApplied ${appliedCount} migration(s).`);
  }
}

main()
  .catch((err) => {
    console.error("\nMigration failed:", err);
    process.exit(1);
  })
  .finally(() => {
    client.close();
  });
