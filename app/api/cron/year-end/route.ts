import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { runAutoYearEndCarryoverForAllTenants } from "@/lib/cron/year-end-carryover";

/**
 * Cron: Jahreswechsel-Carryover (`GET`), nur am 1.1. (Europe/Zurich) aktiv.
 * Optional `AUTO_YEAR_END_FORCE=1`: Datums-Check überspringen (Tests).
 * Auth: `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearer = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  const token = bearer?.[1]?.trim();

  if (!secret || secret.length === 0 || token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const force =
    process.env.AUTO_YEAR_END_FORCE === "1" || process.env.AUTO_YEAR_END_FORCE === "true";
  const asOf = new Date();
  const result = await runAutoYearEndCarryoverForAllTenants(prisma, asOf, { force });

  console.log(
    `[cron/year-end] skipped=${result.skipped} fromYear=${result.fromYear} carryoversRun=${result.carryoversRun} tenantsProcessed=${result.tenantsProcessed} tz=${result.timeZone} force=${force}`,
  );
  if (result.errors.length > 0) {
    console.warn("[cron/year-end] errors:", result.errors);
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
}
