"use client";

import type { SettingsSearchEntry } from "@/lib/settings/settings-registry";
import { SETTINGS_CATEGORY_LABELS } from "@/lib/settings/settings-registry";

function resultTypeLabel(entry: SettingsSearchEntry) {
  if (entry.type === "setting") {
    return `${SETTINGS_CATEGORY_LABELS[entry.category]} · Setting`;
  }
  return "Management · Opens management page";
}

export function SettingsSearch({
  value,
  onChange,
  results,
  onSelectResult,
}: {
  value: string;
  onChange: (value: string) => void;
  results: SettingsSearchEntry[];
  onSelectResult: (entry: SettingsSearchEntry) => void;
}) {
  const hasQuery = value.trim().length > 0;

  return (
    <div>
      <label htmlFor="settings-search" className="sr-only">
        Search settings
      </label>
      <input
        id="settings-search"
        type="search"
        placeholder="Search settings"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onChange("");
          }
        }}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-describedby="settings-search-results-count"
      />

      <p id="settings-search-results-count" className="mt-2 text-xs text-foreground-subtle" aria-live="polite">
        {hasQuery ? `${results.length} results` : "Search by setting name or management page"}
      </p>

      {hasQuery ? (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
          {results.length > 0 ? (
            results.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelectResult(entry)}
                  className="w-full px-3 py-3 text-left transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <p className="text-sm font-medium text-foreground">{entry.title}</p>
                  <p className="mt-1 text-xs text-foreground-muted">{entry.description}</p>
                  <p className="mt-1 text-xs text-foreground-subtle">{resultTypeLabel(entry)}</p>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-sm text-foreground-muted">No results found.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
