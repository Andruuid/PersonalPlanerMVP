"use server";

import { z } from "zod";
import { signIn } from "@/lib/auth";

const schema = z.object({
  email: z.string().email("Bitte gültige E-Mail eingeben."),
  password: z.string().min(1, "Passwort eingeben."),
  callbackUrl: z.string().optional(),
});

export type LoginState = {
  ok: boolean;
  error?: string;
};

export async function loginAction(
  _prev: LoginState | undefined,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl") ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      // Always redirect through the root, which routes by role.
      redirectTo: parsed.data.callbackUrl?.startsWith("/")
        ? parsed.data.callbackUrl
        : "/",
    });
    return { ok: true };
  } catch (err) {
    // Auth.js throws a redirect error on success; let Next.js handle it.
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { ok: false, error: "E-Mail oder Passwort ist falsch." };
  }
}
