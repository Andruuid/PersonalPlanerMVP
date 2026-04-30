"use server";

import { redirect } from "next/navigation";
import { auth, unstable_update } from "@/lib/auth";

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
