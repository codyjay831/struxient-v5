import Link from "next/link";
import { AppearanceControl } from "./appearance-control";
import { SidebarNav } from "./sidebar-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
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
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.15em] text-foreground-subtle">
            v5
          </span>
        </Link>
        <SidebarNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-8">
          <span className="min-w-0 truncate text-sm text-foreground-muted">
            {/* Org context — wire to session when auth exists */}
            <span className="text-foreground">Acme Electric</span>
            <span className="mx-2 text-foreground-subtle">·</span>
            <span>Office</span>
          </span>
          <AppearanceControl />
        </header>
        <main className="flex-1 px-8 py-10">{children}</main>
      </div>
    </div>
  );
}
