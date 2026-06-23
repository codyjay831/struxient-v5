"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppearanceControl } from "@/components/shell/appearance-control";
import { SettingsCategoryNav } from "@/components/settings/settings-category-nav";
import { SettingsMobileCategorySelect } from "@/components/settings/settings-mobile-category-select";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsSaveStatus, type SettingsSaveState } from "@/components/settings/settings-save-status";
import { SettingsSearch } from "@/components/settings/settings-search";
import Link from "next/link";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  SettingsManageRow,
  SettingsNumberRow,
  SettingsToggleRow,
} from "@/components/settings/settings-row";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DEFAULT_SETTINGS_SECTION,
  isSettingsSection,
  SETTINGS_MANAGEMENT_LINKS,
  SETTINGS_SEARCH_REGISTRY,
  type SettingsSearchEntry,
  type SettingsSection as SettingsSectionKey,
} from "@/lib/settings/settings-registry";
import {
  updateWorkstationShowQuickActionsAction,
  updateWorkstationUrgentThresholdAction,
} from "@/app/(workspace)/workstation/workstation-settings-actions";

type SaveFeedback = {
  state: SettingsSaveState;
  errorMessage: string | null;
};

const INITIAL_SAVE_FEEDBACK: SaveFeedback = { state: "idle", errorMessage: null };

function nextSectionUrl(pathname: string, section: SettingsSectionKey) {
  if (section === DEFAULT_SETTINGS_SECTION) return pathname;
  return `${pathname}?section=${section}`;
}

export function SettingsPageClient({
  initialShowQuickActions,
  initialUrgentThresholdHours,
  initialPublicRequestEnabled,
  canManageIntakeSettings = false,
  includeAppearance = true,
}: {
  initialShowQuickActions: boolean;
  initialUrgentThresholdHours: number;
  initialPublicRequestEnabled: boolean;
  canManageIntakeSettings?: boolean;
  includeAppearance?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);

  const [showQuickActions, setShowQuickActions] = useState(initialShowQuickActions);
  const [urgentThresholdHours, setUrgentThresholdHours] = useState(initialUrgentThresholdHours);

  const [showQuickActionsFeedback, setShowQuickActionsFeedback] = useState(INITIAL_SAVE_FEEDBACK);
  const [urgentThresholdFeedback, setUrgentThresholdFeedback] = useState(INITIAL_SAVE_FEEDBACK);

  const availableSections: SettingsSectionKey[] = useMemo(
    () =>
      includeAppearance
        ? ["workstation", "customer-intake", "commercial", "appearance"]
        : ["workstation", "customer-intake", "commercial"],
    [includeAppearance],
  );

  const sectionParam = searchParams.get("section");
  const activeSection =
    sectionParam && isSettingsSection(sectionParam) && availableSections.includes(sectionParam)
      ? sectionParam
      : DEFAULT_SETTINGS_SECTION;

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    return SETTINGS_SEARCH_REGISTRY.filter((entry) => {
      if (entry.type === "setting" && !availableSections.includes(entry.category)) {
        return false;
      }
      const haystack = [entry.title, entry.description, ...entry.keywords].join(" ").toLowerCase();
      return haystack.includes(query);
    }).slice(0, 12);
  }, [availableSections, searchQuery]);

  async function saveShowQuickActions(nextValue: boolean) {
    const previous = showQuickActions;
    setShowQuickActions(nextValue);
    setShowQuickActionsFeedback({ state: "saving", errorMessage: null });

    const result = await updateWorkstationShowQuickActionsAction(nextValue);
    if (!result.success) {
      setShowQuickActions(previous);
      setShowQuickActionsFeedback({
        state: "error",
        errorMessage: result.error ?? "Could not save this setting.",
      });
      return;
    }

    setShowQuickActionsFeedback({ state: "saved", errorMessage: null });
    setTimeout(() => setShowQuickActionsFeedback(INITIAL_SAVE_FEEDBACK), 1800);
  }

  async function saveUrgentThreshold(nextValue: number) {
    const clamped = Math.max(1, Math.min(168, Math.trunc(nextValue)));
    const previous = urgentThresholdHours;
    setUrgentThresholdHours(clamped);
    setUrgentThresholdFeedback({ state: "saving", errorMessage: null });

    const result = await updateWorkstationUrgentThresholdAction(clamped);
    if (!result.success) {
      setUrgentThresholdHours(previous);
      setUrgentThresholdFeedback({
        state: "error",
        errorMessage: result.error ?? "Could not save this setting.",
      });
      return;
    }

    setUrgentThresholdFeedback({ state: "saved", errorMessage: null });
    setTimeout(() => setUrgentThresholdFeedback(INITIAL_SAVE_FEEDBACK), 1800);
  }

  function handleSectionChange(section: SettingsSectionKey) {
    setHighlightRowId(null);
    router.push(nextSectionUrl(pathname, section));
  }

  function handleSearchResultSelect(entry: SettingsSearchEntry) {
    if (entry.type === "management") {
      router.push(entry.targetRoute);
      return;
    }

    setHighlightRowId(entry.rowId);
    setSearchQuery("");
    router.push(nextSectionUrl(pathname, entry.targetSection));
  }

  function renderSectionContent(section: SettingsSectionKey) {
    if (section === "workstation") {
      return (
        <div className="space-y-8">
          <SettingsSection title="Workstation" description="Control how Workstation appears and what counts as urgent.">
            <SettingsToggleRow
              rowId="row-show-quick-actions"
              title="Show quick actions"
              description="Show common actions at the top of Workstation."
              ariaLabel="Show quick actions"
              checked={showQuickActions}
              onChange={(checked) => {
                void saveShowQuickActions(checked);
              }}
              status={
                <SettingsSaveStatus
                  state={showQuickActionsFeedback.state}
                  errorMessage={showQuickActionsFeedback.errorMessage}
                />
              }
              highlight={highlightRowId === "row-show-quick-actions"}
            />

            <SettingsNumberRow
              rowId="row-urgent-threshold"
              title="Urgent threshold"
              description="Items due within this window are treated as urgent."
              value={urgentThresholdHours}
              min={1}
              max={168}
              suffix="hours"
              onChange={(value) => {
                void saveUrgentThreshold(value);
              }}
              status={
                <SettingsSaveStatus
                  state={urgentThresholdFeedback.state}
                  errorMessage={urgentThresholdFeedback.errorMessage}
                />
              }
              highlight={highlightRowId === "row-urgent-threshold"}
            />

            <SettingsManageRow
              rowId="row-manage-quick-actions"
              title="Choose quick actions"
              description="Open Workstation to edit the quick action selection list."
              href="/workstation"
            />
          </SettingsSection>
        </div>
      );
    }

    if (section === "customer-intake") {
      return (
        <div className="space-y-8">
          <SettingsSection
            title="Customer intake"
            description="Public request link, customer fields, and staff intake."
          >
            {!canManageIntakeSettings ? (
              <div className="rounded-lg border border-border bg-surface px-4 py-3">
                <p className="text-sm font-medium text-foreground">Admin only</p>
                <p className="mt-1 text-xs text-foreground-muted">
                  Intake configuration requires Owner or Admin. Contact an administrator to change
                  intake forms or public page settings.
                </p>
              </div>
            ) : null}

            <Link
              id="row-manage-customer-intake-hub"
              href="/settings/intake"
              className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-foreground/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Customer intake</p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    Set up your public request page, customer questions, and staff intake form.
                  </p>
                  <div className="mt-2">
                    <StatusBadge
                      label={
                        initialPublicRequestEnabled
                          ? "Public intake: Accepting"
                          : "Public intake: Paused"
                      }
                      tone={initialPublicRequestEnabled ? "approved" : "warning"}
                    />
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast">
                  Open Customer Intake
                </span>
              </div>
            </Link>
          </SettingsSection>
        </div>
      );
    }

    if (section === "commercial") {
      return (
        <div className="space-y-8">
          <SettingsSection
            title="Sales & relationships"
            description="Commercial records are role-gated server-side."
          >
            <div
              id="row-commercial-access-note"
              className="rounded-lg border border-border bg-surface px-4 py-3"
            >
              <p className="text-sm font-medium text-foreground">Role access behavior</p>
              <p className="mt-1 text-xs text-foreground-muted">
                Office, Admin, Owner, and Viewer can open sales and customer records.
                Field and Subcontractor roles are denied and redirected to a safe access-denied state.
              </p>
            </div>
          </SettingsSection>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <SettingsSection title="Appearance" description="Theme uses the same state as the header appearance control.">
          <div className="border-t border-border py-4" id="row-theme">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
              <div>
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="mt-1 text-xs text-foreground-muted">
                  Choose light, dark, or system appearance.
                </p>
              </div>
              <div className="justify-self-start sm:justify-self-end">
                <AppearanceControl />
              </div>
            </div>
          </div>
        </SettingsSection>
      </div>
    );
  }

  return (
    <SettingsPageShell
      searchSlot={
        <SettingsSearch
          value={searchQuery}
          onChange={setSearchQuery}
          results={searchResults}
          onSelectResult={handleSearchResultSelect}
        />
      }
      mobileCategorySlot={
        <SettingsMobileCategorySelect
          availableSections={availableSections}
          value={activeSection}
          onChange={handleSectionChange}
        />
      }
      desktopCategorySlot={
        <SettingsCategoryNav
          availableSections={availableSections}
          activeSection={activeSection}
          sectionHref={(section) => nextSectionUrl(pathname, section)}
          managementLinks={SETTINGS_MANAGEMENT_LINKS}
        />
      }
    >
      {renderSectionContent(activeSection)}
    </SettingsPageShell>
  );
}
