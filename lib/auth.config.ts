import type { NextAuthConfig } from "next-auth";

// Edge-safe NextAuth config — used by middleware.
// Does NOT include the Credentials provider (which uses Prisma + bcrypt and
// is therefore not edge-compatible). The middleware only needs the JWT to be
// readable, so this minimal config is enough.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const authUser = user as {
          id?: string;
          role?: "SYSTEM_ADMIN" | "ADMIN" | "EMPLOYEE";
          tenantId?: string | null;
          employeeId?: string | null;
        };
        token.role = authUser.role;
        token.tenantId = authUser.tenantId;
        token.employeeId = authUser.employeeId ?? null;
        token.sub = authUser.id ?? token.sub;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as "SYSTEM_ADMIN" | "ADMIN" | "EMPLOYEE";
        session.user.tenantId =
          typeof token.tenantId === "string" ? token.tenantId : "";
        session.user.employeeId =
          (token.employeeId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
};
