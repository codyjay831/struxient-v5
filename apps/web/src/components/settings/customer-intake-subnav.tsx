"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  INTAKE_CUSTOMER_FIELDS_PATH,
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
    label: "Public page",
    href: INTAKE_PUBLIC_COPY_PATH,
    isActive: (pathname) =>
      pathname === INTAKE_PUBLIC_COPY_PATH || pathname.startsWith(`${INTAKE_PUBLIC_COPY_PATH}/`),
  },
  {
    label: "Customer fields",
    href: INTAKE_CUSTOMER_FIELDS_PATH,
    isActive: (pathname) =>
      pathname === INTAKE_CUSTOMER_FIELDS_PATH ||
      pathname.startsWith(`${INTAKE_CUSTOMER_FIELDS_PATH}/`),
  },
  {
    label: "Staff intake",
    href: INTAKE_STAFF_PATH,
    isActive: (pathname) =>
      pathname === INTAKE_STAFF_PATH || pathname.startsWith(`${INTAKE_STAFF_PATH}/`),
  },
  {
    label: "Specialized forms",
    href: INTAKE_SPECIALIZED_PATH,
    isActive: (pathname) =>
      pathname === INTAKE_SPECIALIZED_PATH ||
      pathname.startsWith(`${INTAKE_SPECIALIZED_PATH}/`) ||
      pathname.startsWith("/settings/intake/forms/"),
  },
];

export function CustomerIntakeSubnav({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Customer intake"
      className={[
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3 text-sm font-medium",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? "text-foreground underline decoration-accent underline-offset-4"
                : "text-foreground-muted transition-colors hover:text-foreground"
            }
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
