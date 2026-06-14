import Link from "next/link";
import { AppearanceControl } from "@/components/shell/appearance-control";
import { PlatformNav } from "@/components/platform/platform-nav";
import { StatusBadge } from "@/components/ui/status-badge";
import { signOut } from "@/auth";
import { buttonClassName } from "@/components/ui/button";

export function PlatformShell({
  children,
  requestId,
}: {
  children: React.ReactNode;
  requestId?: string;
}) {
  const signOutAction = async () => {
    "use server";
    await signOut({ redirectTo: "/login" });
  };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col border-r border-border bg-sidebar px-4 py-6">
        <Link
          href="/platform"
          className="mb-10 flex items-baseline gap-1.5 px-3 transition-opacity hover:opacity-80"
        >
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Struxient
          </span>
        </Link>
        <PlatformNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-8">
          <div className="flex min-w-0 items-center gap-3">
            <StatusBadge label="Platform Operations" tone="sent" />
            {requestId ? (
              <span className="truncate text-xs text-foreground-muted">
                Request {requestId.slice(0, 8)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
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
