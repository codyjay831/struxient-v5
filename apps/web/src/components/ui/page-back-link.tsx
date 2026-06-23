import Link from "next/link";
import type { ReactNode } from "react";

export const pageBackLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function PageBackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={pageBackLinkClass}>
      {children}
    </Link>
  );
}
