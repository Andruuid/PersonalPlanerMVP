import type { PrismaClient } from "@/lib/generated/prisma/client";

export async function createPrivacyRequest(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    employeeId: string;
    type: "EXPORT" | "ERASURE";
    note?: string | null;
  },
) {
  return prisma.privacyRequest.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      type: input.type,
      status: "OPEN",
      note: input.note ?? null,
    },
  });
}

export async function decidePrivacyRequest(
  prisma: PrismaClient,
  input: {
    tenantId: string;
    requestId: string;
    status: "APPROVED" | "REJECTED" | "COMPLETED";
    decidedById: string;
    note?: string | null;
  },
) {
  const existing = await prisma.privacyRequest.findFirst({
    where: { id: input.requestId, tenantId: input.tenantId },
  });
  if (!existing) return null;

  // Tenant scope verified by the preceding findFirst. PrivacyRequest has no
  // compound (tenantId, id) unique key, so update() must use the bare id.
  // eslint-disable-next-line tenant/require-tenant-scope
  const updated = await prisma.privacyRequest.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      decidedById: input.decidedById,
      decidedAt: new Date(),
      note: input.note ?? existing.note,
    },
  });
  return { before: existing, after: updated };
}
