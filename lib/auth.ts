import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isCredentialsLoginAllowed } from "@/lib/auth-credentials-login";
import type { Role } from "@/lib/generated/prisma/enums";

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
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const emailLower = email.toLowerCase();

        const user = await prisma.user.findUnique({
          where: {
            email: emailLower,
          },
          include: {
            employee: {
              select: { id: true, isActive: true, deletedAt: true },
            },
          },
        });
        if (!user || !isCredentialsLoginAllowed(user)) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.email,
          role: user.role,
          tenantId: user.tenantId,
          employeeId: user.employee?.id ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as Record<string, unknown>).role = user.role;
        (token as Record<string, unknown>).tenantId = user.tenantId;
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
