import type { NextAuthConfig } from "next-auth";
import type { StaffRole } from "@prisma/client";

/**
 * Edge-safe Auth.js config for middleware. Must not import Prisma or Node-only modules.
 */
export const authConfig = {
  secret: process.env.AUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (!session.user || !token.sub) {
        return session;
      }

      session.user.id = token.sub;
      session.user.activeOrganizationId =
        typeof token.activeOrganizationId === "string" ? token.activeOrganizationId : null;
      session.user.role = (token.role as StaffRole | undefined) ?? null;

      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
