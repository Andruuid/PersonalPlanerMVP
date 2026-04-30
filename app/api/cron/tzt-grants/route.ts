import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { applyTztPeriodicGrant } from "@/lib/bookings/core";
import { writeAuditCore } from "@/lib/audit/core";
import { logDebug, logError } from "@/lib/logging";

/**
 * Cron: täglich periodische TZT-Kontingent-Freigaben (Modell 1).
 * Aufruf z. B. mit `Authorization: Bearer <CRON_SECRET>` (wie auto-close).
 */
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const bearer = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
    const token = bearer?.[1]?.trim();

    if (!secret || secret.length === 0 || token !== secret) {
      logError("cron:tzt-grants", "Unauthorized request");
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const asOf = new Date();
    logDebug("cron:tzt-grants", "Cron run started", {
      asOf: asOf.toISOString(),
    });
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
      logError("cron:tzt-grants", "Cron finished with tenant errors", {
        errors: result.errors,
      });
    }
    logDebug("cron:tzt-grants", "Cron run completed", {
      grantsApplied: result.grantsApplied,
      errorCount: result.errors.length,
    });

    return NextResponse.json({
      ok: true,
      grantsApplied: result.grantsApplied,
      processedAt: asOf.toISOString(),
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (err) {
    logError("cron:tzt-grants", "Cron execution failed", { error: err });
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
