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
        eyebrow="Configuration"
        title="Settings"
        description="Where company defaults and personal preferences will live once accounts and persistence exist. This is a shell—not an admin console, payroll desk, or security center yet."
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          This area
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          Settings shapes how Struxient behaves for you and your company later. It does
          not hold leads, quotes, customers, jobs, or Workstation attention—those stay
          in their own parts of the app.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Configuration shell" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            No persistence, no auth, not Admin yet
          </span>
        </div>
      </WorkspacePanel>

      <section className="mb-10">
        <SectionHeading
          title="Settings areas"
          description="Company-wide shells vs your own preference shells—both are honest placeholders today."
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
              Org-wide configuration shell—employees, roles, payroll, billing, and org
              security are out of scope for this pass →
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
              Per-user preference shell—no account storage yet →
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
          title="Admin-type systems (intentionally later)"
          description="Employee directories, invitations, role matrices, payroll, billing, subscriptions, and org-wide security policy are future systems—not part of this Settings shell."
        />
        <WorkspacePanel>
          <p className="mb-4 text-sm text-foreground-muted">
            Nothing below connects to a database or identity provider. Buttons are
            labels for future work only.
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
