import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sweepErtCases } from "@/lib/ert/sweep";

/**
 * Cron: täglicher ERT-Sweep über alle Mandanten (`GET`).
 * Aufruf z. B. via Netlify Scheduled Function oder Vercel Cron mit
 * `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const bearer = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  const token = bearer?.[1]?.trim();

  if (!secret || secret.length === 0 || token !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  const asOf = new Date();
  for (const t of tenants) {
    await sweepErtCases(prisma, t.id, asOf);
  }

  return NextResponse.json({
    ok: true,
    tenantsProcessed: tenants.length,
    processedAt: asOf.toISOString(),
  });
}
