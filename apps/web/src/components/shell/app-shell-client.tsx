"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Menu } from "lucide-react";
import { StruxientLogo } from "@/components/brand/struxient-logo";
import { AppearanceControl } from "./appearance-control";
import { MobileNavDrawer } from "./mobile-nav-drawer";
import { OrganizationSwitcher } from "./organization-switcher";
import { SidebarNav } from "./sidebar-nav";
import {
  shellHeaderClass,
  shellMainClass,
  shellSidebarClass,
} from "./shell-layout-classes";
import { buttonClassName } from "@/components/ui/button";
import type { StaffRole } from "@prisma/client";

export function AppShellClient({
  children,
  role,
  organizations,
  activeOrganizationId,
  signOutAction,
}: {
  children: React.ReactNode;
  role: StaffRole;
  organizations: Array<{ organizationId: string; organizationName: string }>;
  activeOrganizationId: string;
  signOutAction: () => Promise<void>;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const signOutForm = (className?: string) => (
    <form action={signOutAction}>
      <button type="submit" className={buttonClassName({ variant: "ghost", size: "sm", className })}>
        Sign out
      </button>
    </form>
  );

  return (
    <div className="flex min-h-screen">
      <aside className={shellSidebarClass}>
        <Link
          href="/workstation"
          className="mb-8 flex h-12 items-center px-3 transition-opacity hover:opacity-80"
        >
          <StruxientLogo size="md" />
        </Link>
        <SidebarNav role={role} />
      </aside>

      <MobileNavDrawer
        open={navOpen}
        onOpenChange={setNavOpen}
        title="Workspace"
        returnFocusRef={menuButtonRef}
        footer={
          <div className="space-y-4">
            <Link
              href="/workstation"
              className="flex h-12 items-center px-3 transition-opacity hover:opacity-80"
              onClick={() => setNavOpen(false)}
            >
              <StruxientLogo size="md" />
            </Link>
            <div className="lg:hidden">{signOutForm("w-full justify-start")}</div>
          </div>
        }
      >
        <SidebarNav role={role} onNavigate={() => setNavOpen(false)} />
      </MobileNavDrawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={shellHeaderClass}>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              ref={menuButtonRef}
              type="button"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground lg:hidden"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              aria-expanded={navOpen}
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <Link
              href="/workstation"
              className="flex h-10 items-center transition-opacity hover:opacity-80 lg:hidden"
            >
              <StruxientLogo size="sm" />
            </Link>
          </div>
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <OrganizationSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
            />
            <AppearanceControl />
            <div className="hidden sm:block">{signOutForm()}</div>
          </div>
        </header>
        <main className={shellMainClass}>{children}</main>
      </div>
    </div>
  );
}
