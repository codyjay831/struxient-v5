import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Bell, LayoutDashboard } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default function PersonalSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Personal"
        description="Manage your personal display, notification, and landing preferences."
        actions={
          <>
            <Link href="/settings" className={listLinkClass}>
              ← All settings
            </Link>
            <Link href="/settings/organization" className={listLinkClass}>
              Organization settings
            </Link>
          </>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Personal preference shell
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          Personal settings shape your workspace experience without changing
          organization defaults.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="User preferences" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Personal options for your workspace
          </span>
        </div>
      </WorkspacePanel>

      <div className="space-y-8">
        <section>
          <SectionHeading
            title="Display & layout"
            description="Density, table columns, and locale—optional comfort, not gates to using the app."
          />
          <WorkspacePanel>
            <div className="flex flex-wrap gap-2">
              <PlaceholderButton title="Coming in a future update">
                Compact tables
              </PlaceholderButton>
              <PlaceholderButton title="Coming in a future update">
                Date format
              </PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Default landing"
            description="Choose which page opens first when you start your day."
          />
          <WorkspacePanel>
            <EmptyState
              icon={LayoutDashboard}
              title="Landing not configurable yet"
              description="For now, use bookmarks or manual navigation to choose your start page."
            >
              <PlaceholderButton title="Coming in a future update">
                Default to Workstation
              </PlaceholderButton>
              <PlaceholderButton title="Coming in a future update">
                Default to Jobs
              </PlaceholderButton>
            </EmptyState>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Notifications"
            description="Control email and in-app alerts for quotes, jobs, and schedule updates."
          />
          <WorkspacePanel>
            <EmptyState
              icon={Bell}
              title="No notification settings"
              description="Notification preferences will appear here as alert channels are enabled."
            >
              <PlaceholderButton title="Coming in a future update">
                Quote alerts
              </PlaceholderButton>
              <PlaceholderButton title="Coming in a future update">
                Job alerts
              </PlaceholderButton>
            </EmptyState>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading title="Appearance" />
          <WorkspacePanel>
            <p className="text-sm text-foreground-muted">
              Use the{" "}
              <span className="font-medium text-foreground">
                appearance control in the main header
              </span>{" "}
              for light, dark, or system theme—same control everywhere; no second picker
              here.
            </p>
          </WorkspacePanel>
        </section>
      </div>
    </div>
  );
}
