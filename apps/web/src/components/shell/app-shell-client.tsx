"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronUp, Menu, UserCircle } from "lucide-react";
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
  const [accountOpen, setAccountOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!accountOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        (accountMenuRef.current?.contains(target) || accountButtonRef.current?.contains(target))
      ) {
        return;
      }
      setAccountOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  const signOutForm = (className?: string) => (
    <form action={signOutAction} className="w-full">
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
          className="mb-6 flex h-12 items-center px-3 transition-opacity hover:opacity-80"
        >
          <StruxientLogo size="md" />
        </Link>
        <SidebarNav role={role} />
        <div className="mt-auto px-3 pb-4">
          <div className="relative">
            <button
              ref={accountButtonRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((open) => !open)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground-muted transition-colors hover:bg-foreground/[0.03] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UserCircle className="size-5 shrink-0 opacity-70" strokeWidth={1.5} />
              <span className="flex-1 truncate">Account</span>
              <ChevronUp
                className={[
                  "size-4 shrink-0 opacity-50 transition-transform",
                  accountOpen ? "rotate-180" : "",
                ].join(" ")}
                aria-hidden
              />
            </button>
            {accountOpen ? (
              <div
                ref={accountMenuRef}
                role="menu"
                aria-label="Account menu"
                className="absolute bottom-full left-0 z-50 mb-2 flex max-h-[min(28rem,calc(100vh-5rem))] w-full flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-surface p-3 shadow-lg"
              >
                <OrganizationSwitcher
                  organizations={organizations}
                  activeOrganizationId={activeOrganizationId}
                />
                <AppearanceControl />
                <div className="mt-1 border-t border-border pt-2">
                  {signOutForm("w-full justify-start text-foreground-muted hover:text-foreground")}
                </div>
              </div>
            ) : null}
          </div>
        </div>
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
            <div className="flex flex-col gap-4 border-t border-border pt-4 px-3">
              <OrganizationSwitcher
                organizations={organizations}
                activeOrganizationId={activeOrganizationId}
              />
              <AppearanceControl />
              <div className="border-t border-border pt-2 lg:hidden">
                {signOutForm("w-full justify-start text-foreground-muted hover:text-foreground")}
              </div>
            </div>
          </div>
        }
      >
        <SidebarNav role={role} onNavigate={() => setNavOpen(false)} />
      </MobileNavDrawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`${shellHeaderClass} lg:hidden`}>
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
        </header>
        <main className={shellMainClass}>{children}</main>
      </div>
    </div>
  );
}
