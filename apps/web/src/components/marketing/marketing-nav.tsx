import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "./container";
import { AppearanceControl } from "@/components/shell/appearance-control";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
];

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--mkt-glass-border)] backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="text-base font-semibold tracking-tight text-foreground">
          Struxient
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
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
        <div className="flex items-center gap-2">
          <AppearanceControl />
          <ButtonLink href="/login" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/signup" variant="primary" size="sm" className="shadow-[0_0_0_1px_var(--mkt-glow)]">
            Get started
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}
