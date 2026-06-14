import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { selectDeterministicMembership } from "@/lib/authz/membership-selection";
import { OrganizationInviteStatus } from "@prisma/client";

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS_PER_WINDOW = 10;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) {
          return null;
        }

        const allowed = await checkRateLimit(email, {
          windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
          max: LOGIN_MAX_ATTEMPTS_PER_WINDOW,
          keyPrefix: "auth-login",
        });
        if (!allowed) {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
          },
        });

        if (!user?.passwordHash) return null;

        const validPassword = await compare(password, user.passwordHash);
        if (!validPassword) return null;

        await db.organizationInvite.updateMany({
          where: {
            normalizedEmail: email,
            status: OrganizationInviteStatus.PENDING,
            expiresAt: { lte: new Date() },
          },
          data: { status: OrganizationInviteStatus.EXPIRED },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }

      if (token.sub) {
        const userPreferredOrg = await db.user.findUnique({
          where: { id: token.sub },
          select: { lastActiveOrganizationId: true },
        });

        const memberships = await db.membership.findMany({
          where: { userId: token.sub },
          select: {
            id: true,
            organizationId: true,
            role: true,
            createdAt: true,
          },
        });

        const selectedMembership = selectDeterministicMembership(
          memberships,
          userPreferredOrg?.lastActiveOrganizationId ??
          (typeof token.activeOrganizationId === "string"
            ? token.activeOrganizationId
            : null),
        );

        token.activeOrganizationId = selectedMembership?.organizationId ?? null;
        token.role = selectedMembership?.role ?? null;
      }

      return token;
    },
  },
});
