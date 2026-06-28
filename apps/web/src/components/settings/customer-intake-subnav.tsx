"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  INTAKE_PUBLIC_COPY_PATH,
  INTAKE_SETTINGS_HUB_PATH,
  INTAKE_SPECIALIZED_PATH,
  INTAKE_STAFF_PATH,
} from "@/lib/intake-settings-hierarchy";

type NavItem = {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: INTAKE_SETTINGS_HUB_PATH,
    isActive: (pathname) => pathname === INTAKE_SETTINGS_HUB_PATH,
  },
  {
    label: "Customer request page",
    href: INTAKE_PUBLIC_COPY_PATH,
    isActive: (pathname) =>
      pathname === INTAKE_PUBLIC_COPY_PATH || pathname.startsWith(`${INTAKE_PUBLIC_COPY_PATH}/`),
  },
  {
    label: "Staff intake",
    href: INTAKE_STAFF_PATH,
    isActive: (pathname) =>
      pathname === INTAKE_STAFF_PATH || pathname.startsWith(`${INTAKE_STAFF_PATH}/`),
  },
  {
    label: "Customer request links",
    href: INTAKE_SPECIALIZED_PATH,
    isActive: (pathname) =>
      pathname === INTAKE_SPECIALIZED_PATH ||
      pathname.startsWith(`${INTAKE_SPECIALIZED_PATH}/`) ||
      pathname.startsWith("/settings/intake/customer-fields") ||
      pathname.startsWith("/settings/intake/forms/"),
  },
];

const mobileItemClass =
  "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const mobileInactiveClass = `${mobileItemClass} text-foreground-muted hover:bg-foreground/[0.03] hover:text-foreground`;
const mobileActiveClass = `${mobileItemClass} bg-brand-muted text-accent ring-1 ring-accent/15`;

export function CustomerIntakeSubnav({
  className = "",
  variant = "standalone",
}: {
  className?: string;
  variant?: "standalone" | "embedded";
}) {
  const pathname = usePathname();
  const isEmbedded = variant === "embedded";
  const activeItem = NAV_ITEMS.find((item) => item.isActive(pathname)) ?? NAV_ITEMS[0];

  return (
    <div
      className={[
        "w-full",
        isEmbedded ? "" : "border-b border-border pb-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <details className="rounded-lg border border-border bg-surface sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-xs font-medium text-foreground-subtle">
              Customer intake section
            </span>
            <span className="block">{activeItem.label}</span>
          </span>
          <span className="text-xs text-foreground-subtle">Open</span>
        </summary>
        <ul className="space-y-1 border-t border-border px-2 py-3">
          {NAV_ITEMS.map((item) => {
            const active = item.isActive(pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={active ? mobileActiveClass : mobileInactiveClass}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </details>

      <nav
        aria-label="Customer intake"
        className="hidden items-center gap-4 text-sm font-medium sm:flex"
      >
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 ${
                active
                  ? "text-foreground underline decoration-accent underline-offset-4"
                  : "text-foreground-muted transition-colors hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
