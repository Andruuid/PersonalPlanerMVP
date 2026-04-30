import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isCredentialsLoginAllowed } from "@/lib/auth-credentials-login";
import type { Role } from "@/lib/generated/prisma/enums";
import { logDebug, logError } from "@/lib/logging";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      tenantId: string;
      employeeId?: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    tenantId: string;
    employeeId?: string | null;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(raw) {
        try {
          const parsed = credentialsSchema.safeParse(raw);
          if (!parsed.success) {
            logDebug("auth:authorize", "Credentials schema validation failed");
            return null;
          }
          const { email, password } = parsed.data;

          const emailLower = email.toLowerCase();
          logDebug("auth:authorize", "Authorize attempt", { email: emailLower });

          const user = await prisma.user.findUnique({
            where: {
              email: emailLower,
            },
            include: {
              employee: {
                select: { id: true, status: true },
              },
            },
          });
          if (!user || !isCredentialsLoginAllowed(user)) {
            logDebug("auth:authorize", "Authorize rejected", {
              email: emailLower,
              reason: "user-missing-or-inactive",
            });
            return null;
          }

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) {
            logDebug("auth:authorize", "Authorize rejected", {
              email: emailLower,
              reason: "password-mismatch",
            });
            return null;
          }

          logDebug("auth:authorize", "Authorize success", {
            userId: user.id,
            tenantId: user.tenantId,
            role: user.role,
          });
          return {
            id: user.id,
            email: user.email,
            name: user.email,
            role: user.role,
            tenantId: user.tenantId,
            employeeId: user.employee?.id ?? null,
          };
        } catch (err) {
          logError("auth:authorize", "Authorize failed with exception", { error: err });
          throw err;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as Record<string, unknown>).role = user.role;
        (token as Record<string, unknown>).tenantId =
          user.role === "SYSTEM_ADMIN" ? null : user.tenantId;
        (token as Record<string, unknown>).employeeId = user.employeeId ?? null;
        token.sub = user.id as string;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        const t = token as Record<string, unknown>;
        session.user.id = (token.sub as string) ?? "";
        session.user.role = t.role as Role;
        session.user.tenantId =
          typeof t.tenantId === "string" ? t.tenantId : "";
        session.user.employeeId = (t.employeeId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
});
