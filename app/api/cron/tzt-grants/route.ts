import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { applyTztPeriodicGrant } from "@/lib/bookings/core";
import { writeAuditCore } from "@/lib/audit/core";

/**
 * Cron: täglich periodische TZT-Kontingent-Freigaben (Modell 1).
 * Aufruf z. B. mit `Authorization: Bearer <CRON_SECRET>` (wie auto-close).
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
  const result = await applyTztPeriodicGrant(prisma, asOf);

  for (const g of result.grants) {
    await writeAuditCore(prisma, {
      tenantId: g.tenantId,
      userId: g.createdByUserId,
      action: "TZT_PERIODIC_GRANT",
      entity: "Booking",
      entityId: g.bookingId,
      newValue: {
        employeeId: g.employeeId,
        periodsGranted: g.periodsGranted,
        daysGranted: g.daysGranted,
        grantAnchorIso: g.grantAnchorIso,
        processedAt: asOf.toISOString(),
      },
    });
  }

  if (result.errors.length > 0) {
    console.warn("[cron/tzt-grants] errors:", result.errors);
  }

  console.log(
    `[cron/tzt-grants] grantsApplied=${result.grantsApplied} errors=${result.errors.length}`,
  );

  return NextResponse.json({
    ok: true,
    grantsApplied: result.grantsApplied,
    processedAt: asOf.toISOString(),
    errors: result.errors.length > 0 ? result.errors : undefined,
  });
}
