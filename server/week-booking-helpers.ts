import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import {
  recalcWeekClose as coreRecalcWeekClose,
  removeWeekClosingBookings as coreRemoveWeekClosingBookings,
} from "@/lib/bookings/core";

/**
 * Internal week-close bookkeeping. Keep this outside `"use server"` modules so
 * it is not exposed as a directly callable server action.
 */
export async function recalcWeekCloseForAdmin(
  weekId: string,
  closedByUserId: string,
): Promise<void> {
  const result = await coreRecalcWeekClose(prisma, weekId, closedByUserId);

  await writeAudit({
    userId: closedByUserId,
    action: "RECALC_WEEK",
    entity: "Week",
    entityId: weekId,
    newValue: {
      employeesAffected: result.employeesAffected,
      bookingsCreated: result.bookingsCreated,
    },
  });
}

export async function removeWeekClosingBookingsForAdmin(
  weekId: string,
  reopenedByUserId: string,
): Promise<void> {
  const result = await coreRemoveWeekClosingBookings(prisma, weekId);

  await writeAudit({
    userId: reopenedByUserId,
    action: "REVERT_RECALC_WEEK",
    entity: "Week",
    entityId: weekId,
    newValue: { bookingsRemoved: result.bookingsRemoved },
  });
}
