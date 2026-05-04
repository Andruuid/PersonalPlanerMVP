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

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    tenantId: string | null;
    pendingTenantSelection: boolean;
    employeeId: string | null;
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

          // Cross-tenant by design: a single email may have memberships in
          // multiple tenants. Tenant is selected later via the picker.
          // eslint-disable-next-line tenant/require-tenant-scope
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
        token.role = user.role;
        token.tenantId =
          user.role === "SYSTEM_ADMIN" ? null : user.tenantId;
        token.pendingTenantSelection = user.pendingTenantSelection;
        token.employeeId = user.employeeId ?? null;
        token.sub = user.id;
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
          token.role = userPart.role as Role;
        }
        if (typeof userPart.tenantId === "string" || userPart.tenantId === null) {
          token.tenantId = userPart.tenantId as string | null;
        }
        if (typeof userPart.pendingTenantSelection === "boolean") {
          token.pendingTenantSelection = userPart.pendingTenantSelection;
        }
        if (
          typeof userPart.employeeId === "string" ||
          userPart.employeeId === null
        ) {
          token.employeeId = userPart.employeeId as string | null;
        }
        if (typeof userPart.id === "string") {
          token.sub = userPart.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role;
        session.user.tenantId = token.tenantId;
        session.user.pendingTenantSelection = token.pendingTenantSelection;
        session.user.employeeId = token.employeeId;
      }
      return session;
    },
  },
});
