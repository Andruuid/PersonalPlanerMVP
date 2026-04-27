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
        token.role = (user as { role?: "ADMIN" | "EMPLOYEE" }).role;
        token.employeeId =
          (user as { employeeId?: string | null }).employeeId ?? null;
        token.sub = (user as { id?: string }).id ?? token.sub;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub as string;
        session.user.role = token.role as "ADMIN" | "EMPLOYEE";
        session.user.employeeId =
          (token.employeeId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
};
