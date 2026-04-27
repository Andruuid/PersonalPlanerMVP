import type { PrismaClient } from "@/lib/generated/prisma/client";

export async function createPrivacyRequest(
  prisma: PrismaClient,
  input: {
    employeeId: string;
    type: "EXPORT" | "ERASURE";
    note?: string | null;
  },
) {
  return prisma.privacyRequest.create({
    data: {
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
    requestId: string;
    status: "APPROVED" | "REJECTED" | "COMPLETED";
    decidedById: string;
    note?: string | null;
  },
) {
  const existing = await prisma.privacyRequest.findUnique({
    where: { id: input.requestId },
  });
  if (!existing) return null;

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
