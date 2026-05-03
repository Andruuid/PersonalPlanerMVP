import type { NextAuthConfig } from "next-auth";

// Edge-safe NextAuth config — used by middleware.
// Does NOT include the Credentials provider (which uses Prisma + bcrypt and
// is therefore not edge-compatible). The middleware only needs the JWT to be
// readable, so this minimal config is enough.
//
// JWT/Session/User types are augmented in `lib/auth.ts` (project-global module
// augmentation), so no inline casts are needed here.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.pendingTenantSelection = user.pendingTenantSelection ?? false;
        token.employeeId = user.employeeId ?? null;
        token.sub = user.id ?? token.sub;
      }
      if (typeof token.pendingTenantSelection !== "boolean") {
        token.pendingTenantSelection = false;
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
};
