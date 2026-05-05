import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";

const backClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default function OrganizationSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Organization"
        description="Company-wide profile, people, and defaults—nothing persists here yet. Auth and RBAC will gate mutations later."
        actions={
          <Link href="/settings" className={backClass}>
            ← All settings
          </Link>
        }
      />

      <div className="space-y-8">
        <section>
          <SectionHeading
            title="Company profile"
            description="Legal name, tax IDs, branding, and service territory."
          />
          <WorkspacePanel>
            <p className="mb-4 text-sm text-foreground-muted">
              Org-level edits will require signed-in admins. This shell is read-only
              layout.
            </p>
            <div className="flex flex-wrap gap-2">
              <PlaceholderButton>Edit legal profile</PlaceholderButton>
              <PlaceholderButton>Logo & colors</PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Users & roles"
            description="Invites, seat counts, and role templates—blocked until auth exists."
          />
          <WorkspacePanel>
            <div className="flex flex-wrap gap-2">
              <PlaceholderButton>Invite user</PlaceholderButton>
              <PlaceholderButton>Manage roles</PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Workflow defaults"
            description="Baseline stages, required fields, and handoff hints—optional accelerators, not mandatory setup gates."
          />
          <WorkspacePanel>
            <p className="text-sm text-foreground-muted">
              Defaults will apply org-wide when rules storage exists—no engine runs
              today.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <PlaceholderButton>Lead stages</PlaceholderButton>
              <PlaceholderButton>Quote checklist</PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading title="Appearance" />
          <WorkspacePanel>
            <p className="text-sm text-foreground-muted">
              Theme stays in the{" "}
              <span className="font-medium text-foreground">
                main header appearance control
              </span>{" "}
              so every page stays consistent—no duplicate theme picker here.
            </p>
          </WorkspacePanel>
        </section>
      </div>
    </div>
  );
}
