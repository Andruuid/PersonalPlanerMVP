/**
 * Public entry point for the audit module.
 *
 * The DI-friendly versions live in `./core` (used by tests). This file
 * re-exports the read helpers and provides a singleton-bound `writeAudit`
 * that server actions call directly.
 */
import { prisma } from "@/lib/db";
import { writeAuditCore, type AuditPayload } from "./core";

export type {
  AuditPayload,
  AuditFilter,
  AuditPageOpts,
  AuditRow,
  AuditList,
  AuditFacets,
  DiffField,
} from "./core";

export {
  listAuditLogs,
  loadAuditFacets,
  computeAuditDiff,
  writeAuditCore,
} from "./core";

export async function writeAudit(payload: AuditPayload): Promise<void> {
  try {
    await writeAuditCore(prisma, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : "";
    console.error("[writeAudit]", msg, stack);
  }
}
