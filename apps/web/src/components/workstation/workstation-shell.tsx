"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { parseWorkstationUrlState } from "@/lib/workstation/url-state";
import type { WorkstationLens } from "@/lib/workstation-query";

const SUBROUTE_LABELS: Record<string, string> = {
  "/workstation/tasks": "Tasks",
  "/workstation/jobs": "Jobs",
  "/workstation/schedule": "Schedule",
};

// Secondary lens links exposed in the main nav (not the landing itself).
// Each maps to a WorkstationLens value so they can be filtered by allowedLenses.
const SECONDARY_LENSES: { lens: WorkstationLens; label: string; href: string }[] = [
  { lens: "waiting", label: "Waiting", href: "/workstation?lens=waiting" },
  { lens: "all", label: "All items", href: "/workstation?lens=all" },
];

/**
 * Workstation page chrome.
 *
 * On the main route: shows today's date when on the default landing, or the
 * secondary-lens label when active. Secondary navigation offers only the lenses
 * allowed for the current role, plus browse links to Tasks, Jobs, Schedule.
 *
 * On subroutes: shows the subroute label and a ← Today link back.
 */
export function WorkstationShell({
  allowedSecondaryLenses,
}: {
  allowedSecondaryLenses?: WorkstationLens[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { lens } = parseWorkstationUrlState(searchParams);

  const isMainWorkstation = pathname === "/workstation";
  const activeSubrouteLabel = SUBROUTE_LABELS[pathname] ?? null;

  // Filter secondary lens links by what the role is allowed to see.
  // If no allowedLenses prop provided (e.g. during SSR hydration), show all.
  const visibleSecondaryLenses =
    allowedSecondaryLenses && allowedSecondaryLenses.length > 0
      ? SECONDARY_LENSES.filter((l) => allowedSecondaryLenses.includes(l.lens))
      : SECONDARY_LENSES;

  const landingTitle =
    lens === "waiting" ? "Waiting" : lens === "all" ? "All work" : "The Board";

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const showDate = isMainWorkstation && lens === "attention";

  return (
    <div className="mb-6">
      <header className="border-b border-border pb-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {isMainWorkstation
                ? landingTitle
                : (activeSubrouteLabel ?? "Workstation")}
            </h1>
            {showDate && (
              <p className="mt-0.5 text-sm text-foreground-muted">{todayLabel}</p>
            )}
          </div>

          <nav
            aria-label="Workstation navigation"
            className="flex flex-wrap items-center gap-5 text-sm font-medium"
          >
            {isMainWorkstation ? (
              <>
                {visibleSecondaryLenses.map(({ lens: lensKey, label, href }) => (
                  <Link
                    key={lensKey}
                    href={href}
                    className={
                      lens === lensKey
                        ? "text-foreground underline decoration-accent underline-offset-4"
                        : "text-foreground-muted transition-colors hover:text-foreground"
                    }
                    aria-current={lens === lensKey ? "page" : undefined}
                  >
                    {label}
                  </Link>
                ))}
                {visibleSecondaryLenses.length > 0 && (
                  <span className="select-none text-border" aria-hidden>
                    ·
                  </span>
                )}
                {Object.entries(SUBROUTE_LABELS).map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    className="text-foreground-muted transition-colors hover:text-foreground"
                  >
                    {label}
                  </Link>
                ))}
              </>
            ) : (
              <>
                <Link
                  href="/workstation"
                  className="text-foreground-muted transition-colors hover:text-foreground"
                >
                  ← Today
                </Link>
                {Object.entries(SUBROUTE_LABELS).map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    className={
                      pathname === href
                        ? "text-foreground"
                        : "text-foreground-muted transition-colors hover:text-foreground"
                    }
                    aria-current={pathname === href ? "page" : undefined}
                  >
                    {label}
                  </Link>
                ))}
              </>
            )}
          </nav>
        </div>
      </header>
    </div>
  );
}
