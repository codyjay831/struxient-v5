"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Menu } from "lucide-react";
import { StruxientLogo } from "@/components/brand/struxient-logo";
import { AppearanceControl } from "@/components/shell/appearance-control";
import { MobileNavDrawer } from "@/components/shell/mobile-nav-drawer";
import { PlatformNav } from "@/components/platform/platform-nav";
import {
  shellHeaderClass,
  shellMainClass,
  shellSidebarClass,
} from "@/components/shell/shell-layout-classes";
import { StatusBadge } from "@/components/ui/status-badge";
import { buttonClassName } from "@/components/ui/button";

export function PlatformShellClient({
  children,
  requestId,
  signOutAction,
}: {
  children: React.ReactNode;
  requestId?: string;
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
          href="/platform"
          className="mb-8 flex h-12 items-center px-3 transition-opacity hover:opacity-80"
        >
          <StruxientLogo size="md" />
        </Link>
        <PlatformNav />
      </aside>

      <MobileNavDrawer
        open={navOpen}
        onOpenChange={setNavOpen}
        title="Platform"
        returnFocusRef={menuButtonRef}
        footer={<div className="lg:hidden">{signOutForm("w-full justify-start")}</div>}
      >
        <PlatformNav onNavigate={() => setNavOpen(false)} />
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
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <StatusBadge label="Platform Operations" tone="sent" />
              {requestId ? (
                <span className="hidden truncate text-xs text-foreground-muted sm:inline">
                  Request {requestId.slice(0, 8)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <AppearanceControl />
            <div className="hidden sm:block">{signOutForm()}</div>
          </div>
        </header>
        <main className={shellMainClass}>{children}</main>
      </div>
    </div>
  );
}
