import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";

const cardLinkClass =
  "group block rounded-xl border border-border bg-surface p-6 shadow-sm transition-colors hover:border-border-strong hover:bg-foreground/[0.02]";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb items={[{ label: "Settings" }]} />
      <PageHeader
        eyebrow="Organization"
        title="Settings"
        description="Org profile, members, integrations, and personal preferences will live here behind authentication—this page routes you into the shells that exist today."
      />

      <section className="mb-10">
        <SectionHeading
          title="Settings areas"
          description="Company-wide controls vs your own preferences—both are placeholders until persistence ships."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/settings/organization" className={cardLinkClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Organization
            </p>
            <p className="mt-2 text-sm font-medium text-foreground group-hover:underline">
              Company profile, users, roles, workflow defaults
            </p>
            <p className="mt-2 text-xs text-foreground-muted">
              Open the org shell →
            </p>
          </Link>
          <Link href="/settings/personal" className={cardLinkClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Personal
            </p>
            <p className="mt-2 text-sm font-medium text-foreground group-hover:underline">
              Display, notifications, default landing
            </p>
            <p className="mt-2 text-xs text-foreground-muted">
              Open personal shell →
            </p>
          </Link>
        </div>
      </section>

      <div className="space-y-10">
        <section>
          <SectionHeading title="Appearance" />
          <WorkspacePanel>
            <p className="text-sm text-foreground-muted">
              Theme (light / dark / system) is already available from the{" "}
              <span className="font-medium text-foreground">
                appearance control in the main header
              </span>
              . It follows this device and respects your choice via{" "}
              <code className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-xs">
                next-themes
              </code>
              —no extra settings mutation is required here.
            </p>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Organization (summary)"
            description="Legal entity, tax IDs, service territory, and brand assets—full layout lives on the organization page."
          />
          <WorkspacePanel>
            <p className="mb-4 text-sm text-foreground-muted">
              Org-level changes will require authenticated admins. Nothing below
              writes to storage in this baseline.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/settings/organization"
                className="inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90"
              >
                Organization settings
              </Link>
              <PlaceholderButton>Integrations (soon)</PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="People & access"
            description="Users, roles, and invitations—blocked until authentication exists."
          />
          <WorkspacePanel>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/settings/organization"
                className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
              >
                Manage in organization settings
              </Link>
              <PlaceholderButton>Invite teammate</PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>
      </div>
    </div>
  );
}
