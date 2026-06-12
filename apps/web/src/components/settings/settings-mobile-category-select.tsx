"use client";

import type { SettingsSection } from "@/lib/settings/settings-registry";
import { SETTINGS_CATEGORY_LABELS } from "@/lib/settings/settings-registry";

export function SettingsMobileCategorySelect({
  availableSections,
  value,
  onChange,
}: {
  availableSections: SettingsSection[];
  value: SettingsSection;
  onChange: (next: SettingsSection) => void;
}) {
  return (
    <div className="lg:hidden">
      <label htmlFor="settings-mobile-section" className="text-xs font-medium text-foreground-subtle">
        Category
      </label>
      <select
        id="settings-mobile-section"
        aria-label="Settings category"
        value={value}
        onChange={(event) => onChange(event.target.value as SettingsSection)}
        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {availableSections.map((section) => (
          <option key={section} value={section}>
            {SETTINGS_CATEGORY_LABELS[section]}
          </option>
        ))}
      </select>
    </div>
  );
}
