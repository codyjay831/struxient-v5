import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";

const cardLinkClass =
  "group block rounded-xl border border-border bg-surface p-6 shadow-sm transition-colors hover:border-border-strong hover:bg-foreground/[0.02]";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb items={[{ label: "Settings" }]} />
      <PageHeader
        title="Settings"
        description="Set up company defaults and personal preferences for how your team uses Struxient."
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          This area
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          Settings controls behavior and defaults. Your operational records stay
          in Sales, Customers, Jobs, and Workstation.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Configuration" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Company and personal preferences
          </span>
        </div>
      </WorkspacePanel>

      <section className="mb-10">
        <SectionHeading
          title="Commercial configuration"
          description="Customer intake and reusable quote scope for your organization."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/settings/intake" className={cardLinkClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Customer intake
            </p>
            <p className="mt-2 text-sm font-medium text-foreground group-hover:underline">
              Public request link, copy, and intake paths
            </p>
            <p className="mt-2 text-xs text-foreground-muted">
              Default-first setup — custom forms tucked under Advanced →
            </p>
          </Link>
          <Link href="/settings/scope-library" className={cardLinkClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Scope Library
            </p>
            <p className="mt-2 text-sm font-medium text-foreground group-hover:underline">
              Manage reusable quote line items
            </p>
            <p className="mt-2 text-xs text-foreground-muted">
              Create and edit templates for common services and pricing →
            </p>
          </Link>
        </div>
      </section>

      <section className="mb-10">
        <SectionHeading
          title="Settings areas"
          description="Manage company-wide defaults and your own workspace preferences."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/settings/organization" className={cardLinkClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Organization
            </p>
            <p className="mt-2 text-sm font-medium text-foreground group-hover:underline">
              Company profile, org defaults, future team controls
            </p>
            <p className="mt-2 text-xs text-foreground-muted">
              Company profile, defaults, and team-level setup →
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
              Personal display, notification, and landing preferences →
            </p>
          </Link>
        </div>
      </section>

      <section className="mb-10">
        <SectionHeading title="Appearance" />
        <WorkspacePanel>
          <p className="text-sm text-foreground-muted">
            Light, dark, and system theme are already controlled from the{" "}
            <span className="font-medium text-foreground">
              appearance control in the main header
            </span>
            . Use that control on any page—no duplicate theme picker here.
          </p>
        </WorkspacePanel>
      </section>

      <section className="mb-10">
        <SectionHeading
          title="Coming later"
          description="More advanced admin systems will appear here as your account setup expands."
        />
        <WorkspacePanel>
          <p className="mb-4 text-sm text-foreground-muted">
            These areas are planned next.
          </p>
          <div className="flex flex-wrap gap-2">
            <PlaceholderButton title="Not built in v5 shell">
              Team directory (future)
            </PlaceholderButton>
            <PlaceholderButton title="Not built in v5 shell">
              Billing & subscriptions (future)
            </PlaceholderButton>
            <PlaceholderButton title="Not built in v5 shell">
              Org security policy (future)
            </PlaceholderButton>
          </div>
        </WorkspacePanel>
      </section>

      <HandoffPanel
        title="Configuration, not operations"
        description="Sales and Relationships carry real records today; Work and Reserved shells hold planning placeholders; Workstation is a static attention layout. Settings only prepares defaults and preferences for when auth and storage land."
      >
        <Link href="/workstation" className={handoffMutedLinkClass}>
          Workstation
        </Link>
      </HandoffPanel>
    </div>
  );
}
