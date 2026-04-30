import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { runAutoYearEndCarryoverForAllTenants } from "@/lib/cron/year-end-carryover";
import { logDebug, logError } from "@/lib/logging";

/**
 * Cron: Jahreswechsel-Carryover (`GET`), nur am 1.1. (Europe/Zurich) aktiv.
 * Optional `AUTO_YEAR_END_FORCE=1`: Datums-Check überspringen (Tests).
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const bearer = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
    const token = bearer?.[1]?.trim();

    if (!secret || secret.length === 0 || token !== secret) {
      logError("cron:year-end", "Unauthorized request");
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const force =
      process.env.AUTO_YEAR_END_FORCE === "1" || process.env.AUTO_YEAR_END_FORCE === "true";
    const asOf = new Date();
    logDebug("cron:year-end", "Cron run started", {
      asOf: asOf.toISOString(),
      force,
    });
    const result = await runAutoYearEndCarryoverForAllTenants(prisma, asOf, { force });
    logDebug("cron:year-end", "Cron run completed", {
      skipped: result.skipped,
      fromYear: result.fromYear,
      carryoversRun: result.carryoversRun,
      tenantsProcessed: result.tenantsProcessed,
      timeZone: result.timeZone,
      force,
      errorCount: result.errors.length,
    });
    if (result.errors.length > 0) {
      logError("cron:year-end", "Cron finished with tenant errors", {
        errors: result.errors,
      });
    }

    return NextResponse.json({
      ok: true,
      skipped: result.skipped,
      reason: result.reason,
      fromYear: result.fromYear,
      timeZone: result.timeZone,
      carryoversRun: result.carryoversRun,
      tenantsProcessed: result.tenantsProcessed,
      processedAt: asOf.toISOString(),
      force: force ? true : undefined,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (err) {
    logError("cron:year-end", "Cron execution failed", { error: err });
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
