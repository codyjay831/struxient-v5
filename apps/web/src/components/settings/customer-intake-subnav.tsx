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
    label: "Customer request page",
    href: INTAKE_PUBLIC_COPY_PATH,
    isActive: (pathname) =>
      pathname === INTAKE_PUBLIC_COPY_PATH || pathname.startsWith(`${INTAKE_PUBLIC_COPY_PATH}/`),
  },
  {
    label: "Customer questions",
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
    label: "Specialized request links",
    href: INTAKE_SPECIALIZED_PATH,
    isActive: (pathname) =>
      pathname === INTAKE_SPECIALIZED_PATH ||
      pathname.startsWith(`${INTAKE_SPECIALIZED_PATH}/`) ||
      pathname.startsWith("/settings/intake/forms/"),
  },
];

export function CustomerIntakeSubnav({
  className = "",
  variant = "standalone",
}: {
  className?: string;
  variant?: "standalone" | "embedded";
}) {
  const pathname = usePathname();
  const isEmbedded = variant === "embedded";

  return (
    <nav
      aria-label="Customer intake"
      className={[
        "flex items-center gap-4 overflow-x-auto text-sm font-medium [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        isEmbedded ? "" : "border-b border-border pb-3",
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
  );
}
