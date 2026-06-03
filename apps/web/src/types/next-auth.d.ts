import type { DefaultSession } from "next-auth";
import type { StaffRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      activeOrganizationId?: string | null;
      role?: StaffRole | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    activeOrganizationId?: string | null;
    role?: StaffRole | null;
  }
}
