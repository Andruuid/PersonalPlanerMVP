import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  autoClosePastPublishedWeeksForAllTenants,
  autoFinalizePastDraftWeeksForAllTenants,
} from "@/lib/cron/auto-close-past-weeks";
import { logDebug, logError } from "@/lib/logging";

/**
 * Cron: täglich vergangene PUBLISHED-Wochen abschließen und vergangene
 * DRAFT-Wochen mit Planungen finalisieren (`GET`).
 * PUBLISHED: `recalcWeekClose`, `CLOSED`/`closedAt`, Audit `AUTO_CLOSE`.
 * DRAFT: leer → Audit `AUTO_CLOSE_SKIPPED_EMPTY`; sonst recalc + `CLOSED`,
 * Audit `AUTO_CLOSE_FROM_DRAFT`.
 * Aufruf z. B. via Netlify Scheduled Function mit `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const bearer = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
    const token = bearer?.[1]?.trim();

    if (!secret || secret.length === 0 || token !== secret) {
      logError("cron:auto-close", "Unauthorized request");
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const asOf = new Date();
    logDebug("cron:auto-close", "Cron run started", {
      asOf: asOf.toISOString(),
    });
    const published = await autoClosePastPublishedWeeksForAllTenants(prisma, asOf);
    const draft = await autoFinalizePastDraftWeeksForAllTenants(prisma, asOf);

    const errors = [...published.errors, ...draft.errors];
    logDebug("cron:auto-close", "Cron run completed", {
      publishedWeeksClosed: published.weeksClosed,
      draftWeeksClosed: draft.weeksClosedFromDraft,
      draftWeeksSkippedEmpty: draft.weeksSkippedEmpty,
      tenantsProcessed: published.tenantsProcessed,
      errorCount: errors.length,
    });
    if (errors.length > 0) {
      logError("cron:auto-close", "Cron finished with tenant errors", { errors });
    }

    return NextResponse.json({
      ok: true,
      tenantsProcessed: published.tenantsProcessed,
      publishedWeeksClosed: published.weeksClosed,
      draftWeeksClosed: draft.weeksClosedFromDraft,
      draftWeeksSkippedEmpty: draft.weeksSkippedEmpty,
      processedAt: asOf.toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    logError("cron:auto-close", "Cron execution failed", { error: err });
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
