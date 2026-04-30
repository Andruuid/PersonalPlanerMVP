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
      tenantId: string | null;
      pendingTenantSelection: boolean;
      employeeId?: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    role: Role;
    tenantId: string | null;
    pendingTenantSelection: boolean;
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
  unstable_update,
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

          const users = await prisma.user.findMany({
            where: { email: emailLower },
            include: {
              employee: {
                select: { id: true, status: true },
              },
            },
            orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
          });
          const allowedUsers = users.filter((candidate) =>
            isCredentialsLoginAllowed(candidate),
          );
          if (allowedUsers.length === 0) {
            logDebug("auth:authorize", "Authorize rejected", {
              email: emailLower,
              reason: "user-missing-or-inactive",
            });
            return null;
          }

          const passwordMatches: typeof allowedUsers = [];
          for (const candidate of allowedUsers) {
            // Each tenant has its own user row, so we must validate all candidates.
            const valid = await bcrypt.compare(password, candidate.passwordHash);
            if (valid) passwordMatches.push(candidate);
          }
          if (passwordMatches.length === 0) {
            logDebug("auth:authorize", "Authorize rejected", {
              email: emailLower,
              reason: "password-mismatch",
            });
            return null;
          }

          const selectedUser = passwordMatches[0];
          const pendingTenantSelection = passwordMatches.length > 1;

          logDebug("auth:authorize", "Authorize success", {
            userId: selectedUser.id,
            tenantId: pendingTenantSelection ? null : selectedUser.tenantId,
            role: selectedUser.role,
            pendingTenantSelection,
            tenantCount: passwordMatches.length,
          });
          return {
            id: selectedUser.id,
            email: selectedUser.email,
            name: selectedUser.email,
            role: selectedUser.role,
            tenantId: pendingTenantSelection ? null : selectedUser.tenantId,
            pendingTenantSelection,
            employeeId: pendingTenantSelection
              ? null
              : (selectedUser.employee?.id ?? null),
          };
        } catch (err) {
          logError("auth:authorize", "Authorize failed with exception", { error: err });
          throw err;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        (token as Record<string, unknown>).role = user.role;
        (token as Record<string, unknown>).tenantId =
          user.role === "SYSTEM_ADMIN" ? null : user.tenantId;
        (token as Record<string, unknown>).pendingTenantSelection =
          user.pendingTenantSelection;
        (token as Record<string, unknown>).employeeId = user.employeeId ?? null;
        token.sub = user.id as string;
      }
      if (trigger === "update" && session) {
        // unstable_update may receive either the v5 Session shape
        // ({ user: { role, tenantId, ... } }) or a flat payload from older
        // call sites; read from .user when present, fall back to top-level.
        const raw = session as Record<string, unknown>;
        const userPart =
          raw.user && typeof raw.user === "object"
            ? (raw.user as Record<string, unknown>)
            : raw;
        if (typeof userPart.role === "string") {
          (token as Record<string, unknown>).role = userPart.role;
        }
        if (typeof userPart.tenantId === "string" || userPart.tenantId === null) {
          (token as Record<string, unknown>).tenantId = userPart.tenantId;
        }
        if (typeof userPart.pendingTenantSelection === "boolean") {
          (token as Record<string, unknown>).pendingTenantSelection =
            userPart.pendingTenantSelection;
        }
        if (
          typeof userPart.employeeId === "string" ||
          userPart.employeeId === null
        ) {
          (token as Record<string, unknown>).employeeId = userPart.employeeId;
        }
        if (typeof userPart.id === "string") {
          token.sub = userPart.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        const t = token as Record<string, unknown>;
        session.user.id = (token.sub as string) ?? "";
        session.user.role = t.role as Role;
        session.user.tenantId =
          typeof t.tenantId === "string" ? t.tenantId : null;
        session.user.pendingTenantSelection = Boolean(t.pendingTenantSelection);
        session.user.employeeId = (t.employeeId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
});
