"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppearanceControl } from "@/components/shell/appearance-control";
import { SettingsCategoryNav } from "@/components/settings/settings-category-nav";
import { SettingsMobileCategorySelect } from "@/components/settings/settings-mobile-category-select";
import { SettingsPageShell } from "@/components/settings/settings-page-shell";
import { SettingsSaveStatus, type SettingsSaveState } from "@/components/settings/settings-save-status";
import { SettingsSearch } from "@/components/settings/settings-search";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  SettingsManageRow,
  SettingsNumberRow,
  SettingsToggleRow,
} from "@/components/settings/settings-row";
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
import { updatePublicRequestEnabledAction } from "@/app/(workspace)/settings/public-request-settings/public-request-settings-actions";

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
  includeAppearance = true,
}: {
  initialShowQuickActions: boolean;
  initialUrgentThresholdHours: number;
  initialPublicRequestEnabled: boolean;
  includeAppearance?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);

  const [showQuickActions, setShowQuickActions] = useState(initialShowQuickActions);
  const [urgentThresholdHours, setUrgentThresholdHours] = useState(initialUrgentThresholdHours);
  const [publicRequestEnabled, setPublicRequestEnabled] = useState(initialPublicRequestEnabled);

  const [showQuickActionsFeedback, setShowQuickActionsFeedback] = useState(INITIAL_SAVE_FEEDBACK);
  const [urgentThresholdFeedback, setUrgentThresholdFeedback] = useState(INITIAL_SAVE_FEEDBACK);
  const [publicRequestFeedback, setPublicRequestFeedback] = useState(INITIAL_SAVE_FEEDBACK);

  const [disablePublicConfirmOpen, setDisablePublicConfirmOpen] = useState(false);

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

  async function savePublicRequestEnabled(nextValue: boolean) {
    const previous = publicRequestEnabled;
    setPublicRequestEnabled(nextValue);
    setPublicRequestFeedback({ state: "saving", errorMessage: null });

    const result = await updatePublicRequestEnabledAction(nextValue);
    if (!result.success) {
      setPublicRequestEnabled(previous);
      setPublicRequestFeedback({
        state: "error",
        errorMessage: result.error ?? "Could not save this setting.",
      });
      return;
    }

    setPublicRequestFeedback({ state: "saved", errorMessage: null });
    setTimeout(() => setPublicRequestFeedback(INITIAL_SAVE_FEEDBACK), 1800);
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
          <SettingsSection title="Customer intake" description="Control public intake availability and jump to intake management pages.">
            <SettingsToggleRow
              rowId="row-accept-public-requests"
              title="Accept public requests"
              description="Allow customers to submit requests through your public request page."
              ariaLabel="Accept public requests"
              checked={publicRequestEnabled}
              onChange={(checked) => {
                if (checked) {
                  void savePublicRequestEnabled(true);
                  return;
                }
                setDisablePublicConfirmOpen(true);
              }}
              status={
                <>
                  <p className="text-xs text-foreground-muted">
                    Status: {publicRequestEnabled ? "Accepting requests" : "Paused"}
                  </p>
                  <SettingsSaveStatus
                    state={publicRequestFeedback.state}
                    errorMessage={publicRequestFeedback.errorMessage}
                    className="mt-1"
                  />
                </>
              }
              highlight={highlightRowId === "row-accept-public-requests"}
            />

            <SettingsManageRow
              rowId="row-manage-public-request-page"
              title="Public request page"
              description="Manage customer-facing request page copy and details."
              href="/settings/public-request-settings"
            />

            <SettingsManageRow
              rowId="row-manage-office-intake-form"
              title="Office intake form"
              description="Manage staff intake at /leads/new."
              href="/settings/intake/office"
            />

            <SettingsManageRow
              rowId="row-manage-custom-intake-forms"
              title="Custom intake forms"
              description="Manage additional public and custom intake forms."
              href="/settings/intake-forms"
            />
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
    <>
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

      {disablePublicConfirmOpen ? (
        <dialog open className="fixed inset-0 z-50 m-0 h-full w-full bg-foreground/40 p-0">
          <div className="mx-auto mt-[12vh] w-[min(92vw,28rem)] rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground">Turn off public requests?</h2>
            <p className="mt-2 text-sm text-foreground-muted">
              Customers will no longer be able to submit through your public request link.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDisablePublicConfirmOpen(false)}
                className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDisablePublicConfirmOpen(false);
                  void savePublicRequestEnabled(false);
                }}
                className="inline-flex min-h-11 items-center rounded-lg border border-border bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                Turn off
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
