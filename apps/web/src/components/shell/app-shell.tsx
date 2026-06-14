import Link from "next/link";
import { AppearanceControl } from "./appearance-control";
import { SidebarNav } from "./sidebar-nav";
import { OrganizationSwitcher } from "./organization-switcher";
import { signOut } from "@/auth";
import { buttonClassName } from "@/components/ui/button";
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
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col border-r border-border bg-sidebar px-4 py-6">
        <Link
          href="/workstation"
          className="mb-10 flex items-baseline gap-1.5 px-3 transition-opacity hover:opacity-80"
        >
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Struxient
          </span>
        </Link>
        <SidebarNav role={role} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-8">
          <span className="min-w-0 truncate text-sm text-foreground-muted">Workspace</span>
          <div className="flex items-center gap-2">
            <OrganizationSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
            />
            <AppearanceControl />
            <form action={signOutAction}>
              <button type="submit" className={buttonClassName({ variant: "ghost", size: "sm" })}>
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-8 py-10">{children}</main>
      </div>
    </div>
  );
}
