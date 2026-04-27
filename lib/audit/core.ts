/**
 * Audit-log core: pure(-ish) DB-bound business logic.
 *
 * This module is intentionally decoupled from Next.js, auth, and cache
 * revalidation. Every public function takes a `PrismaClient` as its first
 * parameter so it can be exercised against any libsql/sqlite database
 * (production or in-memory test fixtures).
 *
 * Server-side wrappers in `lib/audit/index.ts` bind the singleton client.
 */

import type { PrismaClient } from "@/lib/generated/prisma/client";

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface AuditPayload {
  userId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  comment?: string | null;
}

export async function writeAuditCore(
  prisma: PrismaClient,
  payload: AuditPayload,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: payload.userId,
      action: payload.action,
      entity: payload.entity,
      entityId: payload.entityId ?? null,
      oldValue:
        payload.oldValue === undefined ? null : JSON.stringify(payload.oldValue),
      newValue:
        payload.newValue === undefined ? null : JSON.stringify(payload.newValue),
      comment: payload.comment ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Read: filters + pagination
// ---------------------------------------------------------------------------

export interface AuditFilter {
  userId?: string;
  entity?: string;
  action?: string;
  /** Inclusive lower bound, ISO date `YYYY-MM-DD` (local midnight). */
  fromIso?: string;
  /** Inclusive upper bound, ISO date `YYYY-MM-DD` (local end-of-day). */
  toIso?: string;
}

export interface AuditPageOpts {
  /** 1-based page index. */
  page: number;
  pageSize: number;
}

export interface AuditRow {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  comment: string | null;
  createdAt: Date;
}

export interface AuditList {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDateLocal(iso: string | undefined): Date | undefined {
  if (!iso || !ISO_DATE_RE.test(iso)) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parseValue(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function listAuditLogs(
  prisma: PrismaClient,
  filter: AuditFilter,
  page: AuditPageOpts,
): Promise<AuditList> {
  const pageSize = Math.max(1, Math.min(page.pageSize, 200));
  const pageIndex = Math.max(1, Math.floor(page.page));

  const where: {
    userId?: string;
    entity?: string;
    action?: string;
    createdAt?: { gte?: Date; lt?: Date };
  } = {};
  if (filter.userId) where.userId = filter.userId;
  if (filter.entity) where.entity = filter.entity;
  if (filter.action) where.action = filter.action;

  const from = parseIsoDateLocal(filter.fromIso);
  const to = parseIsoDateLocal(filter.toIso);
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) {
      const end = new Date(to);
      end.setDate(end.getDate() + 1);
      where.createdAt.lt = end;
    }
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageIndex - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { email: true } } },
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.user.email,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      oldValue: parseValue(r.oldValue),
      newValue: parseValue(r.newValue),
      comment: r.comment,
      createdAt: r.createdAt,
    })),
    total,
    page: pageIndex,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ---------------------------------------------------------------------------
// Read: facets (distinct values for filter dropdowns)
// ---------------------------------------------------------------------------

export interface AuditFacets {
  users: Array<{ id: string; email: string }>;
  entities: string[];
  actions: string[];
}

export async function loadAuditFacets(
  prisma: PrismaClient,
): Promise<AuditFacets> {
  const [entityRows, actionRows, userRows] = await Promise.all([
    prisma.auditLog.findMany({
      distinct: ["entity"],
      select: { entity: true },
      orderBy: { entity: "asc" },
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, email: true },
      orderBy: { email: "asc" },
    }),
  ]);

  return {
    users: userRows,
    entities: entityRows.map((r) => r.entity),
    actions: actionRows.map((r) => r.action),
  };
}

// ---------------------------------------------------------------------------
// Diff helper (used by the UI)
// ---------------------------------------------------------------------------

export interface DiffField {
  key: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Compute a flat key-by-key diff between two audit-log payloads.
 *
 * Both inputs may be `null`, primitives, arrays, or plain objects. When at
 * least one side is an object, the union of top-level keys is returned with
 * a `changed` flag (deep-equality via JSON-stringify, good enough for the
 * shapes we audit).
 *
 * Returns an empty array if neither side has any keys (e.g. both null).
 */
export function computeAuditDiff(
  oldValue: unknown,
  newValue: unknown,
): DiffField[] {
  const oldObj = isPlainObject(oldValue) ? oldValue : null;
  const newObj = isPlainObject(newValue) ? newValue : null;
  if (!oldObj && !newObj) return [];

  const keys = new Set<string>();
  if (oldObj) for (const k of Object.keys(oldObj)) keys.add(k);
  if (newObj) for (const k of Object.keys(newObj)) keys.add(k);

  return Array.from(keys)
    .sort()
    .map((key) => {
      const before = oldObj ? oldObj[key] : undefined;
      const after = newObj ? newObj[key] : undefined;
      return {
        key,
        before,
        after,
        changed: JSON.stringify(before) !== JSON.stringify(after),
      };
    });
}
