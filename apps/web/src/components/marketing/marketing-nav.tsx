"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Menu } from "lucide-react";
import { StruxientLogo } from "@/components/brand/struxient-logo";
import { ButtonLink } from "@/components/ui/button";
import { MobileNavDrawer } from "@/components/shell/mobile-nav-drawer";
import { Container } from "./container";
import { AppearanceControl } from "@/components/shell/appearance-control";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
];

export function MarketingNav() {
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--mkt-glass-border)] backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            ref={menuButtonRef}
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground md:hidden"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            aria-expanded={navOpen}
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <Link href="/" className="flex h-12 items-center transition-opacity hover:opacity-80">
            <StruxientLogo size="sm" />
          </Link>
        </div>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Marketing">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-foreground-muted transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <AppearanceControl />
          <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Sign in
          </ButtonLink>
          <ButtonLink
            href="/signup"
            variant="primary"
            size="sm"
            className="shadow-[0_0_0_1px_var(--mkt-glow)]"
          >
            Get started
          </ButtonLink>
        </div>
      </Container>

      <MobileNavDrawer
        open={navOpen}
        onOpenChange={setNavOpen}
        title="Menu"
        returnFocusRef={menuButtonRef}
        hideFrom="md"
      >
        <nav className="flex flex-col gap-1" aria-label="Marketing mobile">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setNavOpen(false)}
              className="rounded-lg px-3 py-3 text-sm font-medium text-foreground-muted transition-colors hover:bg-foreground/[0.03] hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-4 border-t border-border pt-4">
            <ButtonLink
              href="/login"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setNavOpen(false)}
            >
              Sign in
            </ButtonLink>
          </div>
        </nav>
      </MobileNavDrawer>
    </header>
  );
}
