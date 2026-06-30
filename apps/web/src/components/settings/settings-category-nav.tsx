import Link from "next/link";
import type { SettingsManagementGroup, SettingsSection } from "@/lib/settings/settings-registry";
import { SETTINGS_CATEGORY_LABELS } from "@/lib/settings/settings-registry";

const baseItemClass =
  "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors";
const inactiveClass = `${baseItemClass} text-foreground-muted hover:bg-foreground/[0.03] hover:text-foreground`;
const activeClass = `${baseItemClass} bg-brand-muted text-accent ring-1 ring-accent/15`;

export function SettingsCategoryNav({
  availableSections,
  activeSection,
  sectionHref,
  managementGroups,
}: {
  availableSections: SettingsSection[];
  activeSection: SettingsSection;
  sectionHref: (section: SettingsSection) => string;
  managementGroups: readonly SettingsManagementGroup[];
}) {
  return (
    <nav aria-label="Settings" className="sticky top-6 space-y-6">
      <div>
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Workspace
        </p>
        <ul className="space-y-1">
          {availableSections.map((section) => {
            const active = section === activeSection;
            return (
              <li key={section}>
                <Link
                  href={sectionHref(section)}
                  aria-current={active ? "page" : undefined}
                  className={active ? activeClass : inactiveClass}
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
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
            {group.title}
          </p>
          <ul className="space-y-1">
            {group.links.map((link) => (
              <li key={link.id}>
                <Link href={link.href} className={inactiveClass}>
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
