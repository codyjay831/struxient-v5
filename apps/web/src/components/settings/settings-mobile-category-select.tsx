"use client";

import Link from "next/link";
import type { SettingsSection } from "@/lib/settings/settings-registry";
import { SETTINGS_CATEGORY_LABELS } from "@/lib/settings/settings-registry";

const mobileMenuLinkClass =
  "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const mobileMenuInactiveClass = `${mobileMenuLinkClass} text-foreground-muted hover:bg-foreground/[0.03] hover:text-foreground`;
const mobileMenuActiveClass = `${mobileMenuLinkClass} bg-brand-muted text-accent ring-1 ring-accent/15`;

export function SettingsMobileMenu({
  availableSections,
  activeSection,
  sectionHref,
  managementLinks,
  currentPathname,
}: {
  availableSections: SettingsSection[];
  activeSection: SettingsSection;
  sectionHref: (section: SettingsSection) => string;
  managementLinks: readonly { id: string; title: string; href: string }[];
  currentPathname: string;
}) {
  const activeLabel = SETTINGS_CATEGORY_LABELS[activeSection];

  return (
    <details className="lg:hidden rounded-lg border border-border bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-xs font-medium text-foreground-subtle">Settings menu</span>
          <span className="block">{activeLabel}</span>
        </span>
        <span className="text-xs text-foreground-subtle">Open</span>
      </summary>

      <div className="border-t border-border px-2 py-3">
        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Settings
        </p>
        <ul className="space-y-1">
          {availableSections.map((section) => {
            const active = section === activeSection && currentPathname === "/settings";
            return (
              <li key={section}>
                <Link
                  href={sectionHref(section)}
                  aria-current={active ? "page" : undefined}
                  className={active ? mobileMenuActiveClass : mobileMenuInactiveClass}
                >
                  {SETTINGS_CATEGORY_LABELS[section]}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Management
        </p>
        <ul className="space-y-1">
          {managementLinks.map((link) => {
            const active =
              currentPathname === link.href || currentPathname.startsWith(`${link.href}/`);
            return (
              <li key={link.id}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={active ? mobileMenuActiveClass : mobileMenuInactiveClass}
                >
                  {link.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
