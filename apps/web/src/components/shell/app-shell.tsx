import { signOut } from "@/auth";

import { AppShellClient } from "./app-shell-client";

import type { StaffRole } from "@prisma/client";



export function AppShell({

  children,

  role,

  organizations,

  activeOrganizationId,

}: {

  children: React.ReactNode;

  role: StaffRole;

  organizations: Array<{ organizationId: string; organizationName: string }>;

  activeOrganizationId: string;

}) {

  const signOutAction = async () => {

    "use server";

    await signOut({ redirectTo: "/login" });

  };



  return (

    <AppShellClient

      role={role}

      organizations={organizations}

      activeOrganizationId={activeOrganizationId}

      signOutAction={signOutAction}

    >

      {children}

    </AppShellClient>

  );

}


