"use client";

import Link from "next/link";
import type { SettingsManagementGroup, SettingsSection } from "@/lib/settings/settings-registry";
import { SETTINGS_CATEGORY_LABELS } from "@/lib/settings/settings-registry";

const mobileIndexLinkClass =
  "flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const mobileIndexInactiveClass = `${mobileIndexLinkClass} text-foreground-muted hover:bg-foreground/[0.03] hover:text-foreground`;
const mobileIndexActiveClass = `${mobileIndexLinkClass} bg-brand-muted text-accent ring-1 ring-accent/15`;

export function SettingsMobileMenu({
  availableSections,
  activeSection,
  sectionHref,
  managementGroups,
  currentPathname,
}: {
  availableSections: SettingsSection[];
  activeSection: SettingsSection;
  sectionHref: (section: SettingsSection) => string;
  managementGroups: readonly SettingsManagementGroup[];
  currentPathname: string;
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="lg:hidden rounded-lg border border-border bg-surface px-3 py-3"
    >
      <p className="px-1 text-sm font-semibold text-foreground">Settings sections</p>
      <p className="mt-1 px-1 text-xs text-foreground-muted">
        Choose a workspace, company, or operations setting.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            Workspace
          </p>
          <ul className="space-y-1">
            {availableSections.map((section) => {
              const active = section === activeSection && currentPathname === "/settings";
              return (
                <li key={section}>
                  <Link
                    href={sectionHref(section)}
                    aria-current={active ? "page" : undefined}
                    className={active ? mobileIndexActiveClass : mobileIndexInactiveClass}
                  >
                    {SETTINGS_CATEGORY_LABELS[section]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {managementGroups.map((group) => (
          <div key={group.id}>
            <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              {group.title}
            </p>
            <ul className="space-y-1">
              {group.links.map((link) => {
                const active =
                  currentPathname === link.href || currentPathname.startsWith(`${link.href}/`);
                return (
                  <li key={link.id}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={active ? mobileIndexActiveClass : mobileIndexInactiveClass}
                    >
                      {link.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
