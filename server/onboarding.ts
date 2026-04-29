"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  provisionNewTenant,
  rawSignupFromForm,
  signupSchema,
} from "@/server/onboarding-core";
import { fieldErrorsFromZod, type ActionResult } from "./_shared";

// TODO(P19): Rate-limit signups (e.g. max 3 signups / hour / IP) via middleware or edge KV.

export async function createTenantAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(rawSignupFromForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Bitte Eingaben prüfen.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const result = await provisionNewTenant(prisma, parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      fieldErrors: result.fieldErrors,
    };
  }

  redirect(`/login`);
}
