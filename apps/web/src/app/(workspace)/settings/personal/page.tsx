import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
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
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Personal" },
        ]}
      />
      <PageHeader
        title="Personal"
        description="Future per-user preferences—display, notifications, and where you land after sign-in. No account system yet, so nothing saves."
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
          This page does not manage passwords, sessions, or identity—those ship with real
          auth later. It only reserves space for how a signed-in user might tune their
          workspace.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="User preferences" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            No persistence in this build
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
              <PlaceholderButton title="No preference store in this build">
                Compact tables (soon)
              </PlaceholderButton>
              <PlaceholderButton title="No preference store in this build">
                Date format (soon)
              </PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Default landing"
            description="Where Struxient might open after sign-in—Workstation vs a Work list is a future preference, not wired today."
          />
          <WorkspacePanel>
            <EmptyState
              icon={LayoutDashboard}
              title="Landing not configurable yet"
              description="Bookmarks and manual navigation decide where you start until preference storage and auth exist."
            >
              <PlaceholderButton title="No preference store in this build">
                Default to Workstation (soon)
              </PlaceholderButton>
              <PlaceholderButton title="No preference store in this build">
                Default to Jobs (soon)
              </PlaceholderButton>
            </EmptyState>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Notifications"
            description="Future email or in-app alerts for quotes, jobs, and schedule—no channels, no delivery rules, and no device tokens in this shell."
          />
          <WorkspacePanel>
            <EmptyState
              icon={Bell}
              title="No notification settings"
              description="When notifications ship, they will respect auth and org policy. Nothing sends from this placeholder."
            >
              <PlaceholderButton title="No notification engine in this build">
                Quote alerts (soon)
              </PlaceholderButton>
              <PlaceholderButton title="No notification engine in this build">
                Job alerts (soon)
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
