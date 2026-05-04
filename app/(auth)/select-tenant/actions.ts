"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, unstable_update } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isCredentialsLoginAllowed } from "@/lib/auth-credentials-login";
import { homePathForRole } from "@/lib/auth-home-path";

export async function selectTenantAction(formData: FormData): Promise<void> {
  const selectedUserId = String(formData.get("selectedUserId") ?? "").trim();
  if (!selectedUserId) {
    redirect("/select-tenant?error=invalid-selection");
  }

  const session = await auth();
  const userEmail = session?.user?.email?.trim().toLowerCase();
  if (!session?.user || !userEmail) {
    redirect("/login");
  }

  // Cross-tenant by design: tenant picker resolves a user row across all
  // memberships matching the authenticated email.
  // eslint-disable-next-line tenant/require-tenant-scope
  const user = await prisma.user.findFirst({
    where: {
      id: selectedUserId,
      email: userEmail,
      isActive: true,
    },
    include: {
      employee: {
        select: { id: true, status: true },
      },
    },
  });
  if (!user || !isCredentialsLoginAllowed(user)) {
    redirect("/select-tenant?error=invalid-selection");
  }

  await unstable_update({
    user: {
      id: user.id,
      role: user.role,
      tenantId: user.role === "SYSTEM_ADMIN" ? null : user.tenantId,
      employeeId: user.employee?.id ?? null,
      pendingTenantSelection: false,
    },
  });
  const cookieStore = await cookies();
  cookieStore.set("lastSelectedTenantId", user.tenantId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect(homePathForRole(user.role));
}
