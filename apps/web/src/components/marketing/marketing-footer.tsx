import Link from "next/link";
import { StruxientLogo } from "@/components/brand/struxient-logo";
import { Container } from "./container";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border py-10">
      <Container className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <StruxientLogo size="sm" />
          <p className="mt-2 text-sm text-foreground-muted">
            Construction management for trades - from quote to execution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-foreground-muted">
          <Link href="/login" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
          <Link href="/signup" className="transition-colors hover:text-foreground">
            Get started
          </Link>
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
        </div>
      </Container>
    </footer>
  );
}
