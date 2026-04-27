import { prisma } from "@/lib/db";

export interface AuditPayload {
  userId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  comment?: string | null;
}

export async function writeAudit(payload: AuditPayload): Promise<void> {
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
