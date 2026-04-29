import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { autoClosePastPublishedWeeksForAllTenants } from "@/lib/cron/auto-close-past-weeks";

/**
 * Cron: täglich vergangene veröffentlichte Wochen automatisch abschließen (`GET`).
 * Ruft `recalcWeekClose`, setzt `CLOSED`/`closedAt`, schreibt Audit `AUTO_CLOSE`.
 * Aufruf z. B. via Netlify Scheduled Function mit `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearer = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  const token = bearer?.[1]?.trim();

  if (!secret || secret.length === 0 || token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const asOf = new Date();
  const result = await autoClosePastPublishedWeeksForAllTenants(prisma, asOf);

  console.log(
    `[cron/auto-close] weeksClosed=${result.weeksClosed} tenantsProcessed=${result.tenantsProcessed}`,
  );
  if (result.errors.length > 0) {
    console.warn("[cron/auto-close] errors:", result.errors);
  }

  return NextResponse.json({
    ok: true,
    weeksClosed: result.weeksClosed,
    tenantsProcessed: result.tenantsProcessed,
    processedAt: asOf.toISOString(),
    errors: result.errors.length > 0 ? result.errors : undefined,
  });
}
