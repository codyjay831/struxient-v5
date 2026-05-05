import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";

const backClass =
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
        eyebrow="Settings"
        title="Personal"
        description="Preferences for this user on this device—no account system yet, so nothing saves."
        actions={
          <Link href="/settings" className={backClass}>
            ← All settings
          </Link>
        }
      />

      <div className="space-y-8">
        <section>
          <SectionHeading
            title="Display"
            description="Density, table columns, and locale—placeholders only."
          />
          <WorkspacePanel>
            <div className="flex flex-wrap gap-2">
              <PlaceholderButton>Compact tables</PlaceholderButton>
              <PlaceholderButton>Date format</PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Notifications"
            description="Email and in-app alerts for quotes, jobs, and schedule—delivery channels ship with auth."
          />
          <WorkspacePanel>
            <div className="flex flex-wrap gap-2">
              <PlaceholderButton>Quote mentions</PlaceholderButton>
              <PlaceholderButton>Job assignments</PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Default landing"
            description="Where Struxient opens after sign-in—Workstation Today vs a Work list."
          />
          <WorkspacePanel>
            <p className="mb-4 text-sm text-foreground-muted">
              Preference storage is not wired; the app always boots into whatever
              route you bookmark for now.
            </p>
            <div className="flex flex-wrap gap-2">
              <PlaceholderButton>Set default to Workstation</PlaceholderButton>
              <PlaceholderButton>Set default to Jobs</PlaceholderButton>
            </div>
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
              for light, dark, or system theme—shared with organization pages so
              contractors see one consistent control.
            </p>
          </WorkspacePanel>
        </section>
      </div>
    </div>
  );
}
