"use server";

import { redirect } from "next/navigation";
import { auth, signOut, unstable_update } from "@/lib/auth";

export async function switchTenantAction(): Promise<void> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  await unstable_update({
    user: {
      pendingTenantSelection: true,
      tenantId: null,
      employeeId: null,
    },
  });
  redirect("/select-tenant");
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
