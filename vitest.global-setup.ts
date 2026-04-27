/**
 * Vitest globalSetup: lazily prepares a SQLite "template" database that
 * integration tests copy on demand.
 *
 * The schema is pushed once per Vitest run (idempotent across reruns thanks
 * to the schema-mtime cache key). The template path is exposed to test
 * processes via `process.env.PPL_TEST_TEMPLATE_DB`.
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = process.cwd();
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const CACHE_DIR = join(tmpdir(), "ppl-test-db-cache");

export async function setup(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });

  const schemaStat = statSync(SCHEMA);
  const cacheKey = String(Math.floor(schemaStat.mtimeMs));
  const templatePath = join(CACHE_DIR, `template-${cacheKey}.db`);

  if (!existsSync(templatePath)) {
    // Drop any older templates so the cache dir doesn't grow unboundedly.
    for (const f of readdirSync(CACHE_DIR)) {
      if (f.startsWith("template-") && f !== `template-${cacheKey}.db`) {
        try {
          rmSync(join(CACHE_DIR, f), { force: true });
        } catch {
          // best-effort cleanup
        }
      }
    }

    execSync(
      `npx prisma db push --accept-data-loss --url "file:${templatePath}"`,
      {
        env: { ...process.env, DATABASE_URL: `file:${templatePath}` },
        stdio: "ignore",
        cwd: ROOT,
      },
    );
  }

  process.env.PPL_TEST_TEMPLATE_DB = templatePath;
}

export async function teardown(): Promise<void> {
  // The template is intentionally kept across runs (cached by schema mtime).
}
