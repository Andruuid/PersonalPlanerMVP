/**
 * Copy all rows from one Turso/libSQL database to another (same schema).
 *
 * Optional — only if you must keep existing production data. For a fresh
 * start (new region, demo data OK): create the new Turso DB, set
 * DATABASE_URL / DATABASE_AUTH_TOKEN in `.env.local`, then
 * `npm run db:push:libsql` and `npm run db:seed` only; do not use this script.
 *
 * Use this when you create a new Turso DB and want to copy data from an
 * existing DB without the Turso CLI (no Windows binary).
 *
 * Prerequisite — empty TARGET must already have migrations applied:
 *
 *   $env:DATABASE_URL="<target libsql://...>"
 *   $env:DATABASE_AUTH_TOKEN="<target token>"
 *   npm run db:push:libsql
 *
 * Then copy data (SOURCE = old DB, TARGET = new DB):
 *
 *   $env:SOURCE_DATABASE_URL="libsql://old...."
 *   $env:SOURCE_DATABASE_AUTH_TOKEN="..."
 *   $env:TARGET_DATABASE_URL="libsql://new...."
 *   $env:TARGET_DATABASE_AUTH_TOKEN="..."
 *   $env:CONFIRM_COPY="YES"
 *   npm run db:copy:turso
 *
 * After a successful run: point Netlify `DATABASE_URL` / `DATABASE_AUTH_TOKEN`
 * at the TARGET database, redeploy, and retire the old Turso DB when ready.
 *
 * Loads `.env.local` then `.env` (same as `db-push-libsql.mts`).
 */

import { config as loadDotenv } from "dotenv";
import { createClient } from "@libsql/client";
import type { InStatement, InValue } from "@libsql/client";

loadDotenv({ path: ".env.local" });
loadDotenv({ path: ".env" });

const CHUNK_SIZE = 80;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

function assertLibsqlUrl(name: string, url: string): void {
  if (!url.startsWith("libsql://")) {
    console.error(`${name} must be a libsql:// URL (got: ${url})`);
    process.exit(1);
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function toInValue(v: unknown): InValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v;
  if (v instanceof Date) return v;
  if (v instanceof ArrayBuffer) return v;
  if (v instanceof Uint8Array) return v;
  if (ArrayBuffer.isView(v)) {
    const u = v as ArrayBufferView;
    return new Uint8Array(u.buffer, u.byteOffset, u.byteLength);
  }
  return String(v);
}

async function listTables(client: ReturnType<typeof createClient>): Promise<string[]> {
  const rs = await client.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  return rs.rows.map((r) => String(r.name));
}

async function main() {
  if (process.env.CONFIRM_COPY !== "YES") {
    console.error(
      "Refusing to run: set CONFIRM_COPY=YES after you have a backup and TARGET schema is migrated (npm run db:push:libsql on TARGET).",
    );
    process.exit(1);
  }

  const sourceUrl = requireEnv("SOURCE_DATABASE_URL");
  const sourceToken = requireEnv("SOURCE_DATABASE_AUTH_TOKEN");
  const targetUrl = requireEnv("TARGET_DATABASE_URL");
  const targetToken = requireEnv("TARGET_DATABASE_AUTH_TOKEN");

  assertLibsqlUrl("SOURCE_DATABASE_URL", sourceUrl);
  assertLibsqlUrl("TARGET_DATABASE_URL", targetUrl);

  if (sourceUrl === targetUrl && sourceToken === targetToken) {
    console.error("SOURCE and TARGET URLs/tokens must not be identical.");
    process.exit(1);
  }

  const source = createClient({ url: sourceUrl, authToken: sourceToken });
  const target = createClient({ url: targetUrl, authToken: targetToken });

  try {
    const tables = await listTables(source);
    const targetTables = new Set(await listTables(target));
    const missing = tables.filter((t) => !targetTables.has(t));
    if (missing.length > 0) {
      console.error(
        "TARGET is missing tables present on SOURCE. Run migrations on TARGET first:\n  ",
        missing.join(", "),
      );
      process.exit(1);
    }

    await target.execute("PRAGMA foreign_keys = OFF");

    for (const table of tables) {
      const q = quoteIdent(table);
      const del = await target.execute(`DELETE FROM ${q}`);
      console.log(`  cleared ${table} (${del.rowsAffected} rows)`);
    }

    for (const table of tables) {
      const q = quoteIdent(table);
      const { rows, columns } = await source.execute(`SELECT * FROM ${q}`);
      if (rows.length === 0) {
        console.log(`  ${table}: 0 rows (skip)`);
        continue;
      }

      const colList = columns.map((c) => quoteIdent(c)).join(", ");
      const placeholders = columns.map(() => "?").join(", ");
      const insertSql = `INSERT INTO ${q} (${colList}) VALUES (${placeholders})`;

      const tx = await target.transaction("write");
      try {
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const slice = rows.slice(i, i + CHUNK_SIZE);
          const stmts: InStatement[] = slice.map((row) => ({
            sql: insertSql,
            args: columns.map((c) => toInValue(row[c as keyof typeof row])),
          }));
          await tx.batch(stmts);
        }
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }

      console.log(`  ${table}: copied ${rows.length} rows`);
    }

    await target.execute("PRAGMA foreign_keys = ON");

    console.log("\nDone. Update Netlify env to TARGET URL/token, redeploy, then delete the old Turso DB when verified.");
  } finally {
    source.close();
    target.close();
  }
}

main().catch((err) => {
  console.error("\nCopy failed:", err);
  process.exit(1);
});
