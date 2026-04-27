/**
 * Per-test SQLite database harness.
 *
 * Each call to `makeTestDb()` copies the schema-pushed template prepared by
 * `vitest.global-setup.ts` into a temp directory, opens a fresh
 * `PrismaClient` against it, and returns a small handle with `reset()` and
 * `close()`. Tests are fully isolated — no state leaks between files or
 * cases.
 */
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface TestDb {
  prisma: PrismaClient;
  /** Truncate every table in FK-safe order. Cheap — call in `beforeEach`. */
  reset(): Promise<void>;
  /** Disconnect Prisma and remove the temp file. Call in `afterAll`. */
  close(): Promise<void>;
}

export function makeTestDb(): TestDb {
  const template = process.env.PPL_TEST_TEMPLATE_DB;
  if (!template) {
    throw new Error(
      "PPL_TEST_TEMPLATE_DB is not set. Did vitest.global-setup.ts run?",
    );
  }

  const dir = mkdtempSync(join(tmpdir(), "ppl-test-"));
  const dbFile = join(dir, `test-${randomUUID()}.db`);
  copyFileSync(template, dbFile);

  const adapter = new PrismaLibSql({ url: `file:${dbFile}` });
  const prisma = new PrismaClient({ adapter, log: ["error"] });

  return {
    prisma,
    async reset(): Promise<void> {
      // Tests need a hard reset between cases; drop append-only triggers first.
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS auditlog_no_update;',
      );
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS auditlog_no_delete;',
      );
      // FK-safe order: leaves first.
      await prisma.auditLog.deleteMany();
      await prisma.ertCase.deleteMany();
      await prisma.booking.deleteMany();
      await prisma.accountBalance.deleteMany();
      await prisma.publishedSnapshot.deleteMany();
      await prisma.absenceRequest.deleteMany();
      await prisma.planEntry.deleteMany();
      await prisma.week.deleteMany();
      await prisma.holiday.deleteMany();
      await prisma.serviceTemplate.deleteMany();
      await prisma.employee.deleteMany();
      await prisma.location.deleteMany();
      await prisma.user.deleteMany();
    },
    async close(): Promise<void> {
      await prisma.$disconnect();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}
