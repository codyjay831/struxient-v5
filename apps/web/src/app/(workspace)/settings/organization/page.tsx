import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Building2, Users } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default function OrganizationSettingsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Organization" },
        ]}
      />
      <PageHeader
        eyebrow="Settings"
        title="Organization"
        description="Future company-level profile and defaults—not an admin engine. No persistence, no invitations, and no role or billing tools in this shell."
        actions={
          <>
            <Link href="/settings" className={listLinkClass}>
              ← All settings
            </Link>
            <Link href="/settings/personal" className={listLinkClass}>
              Personal settings
            </Link>
          </>
        }
      />

      <WorkspacePanel padding="compact" className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Organization configuration
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">
          This route is a layout shell for how the company record might look later. It is
          not HR, not payroll, not permissions, and not subscription management.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Org shell" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Read-only placeholders only
          </span>
        </div>
      </WorkspacePanel>

      <div className="space-y-8">
        <section>
          <SectionHeading
            title="Company profile"
            description="Legal entity, tax IDs, branding, and service territory—future fields only."
          />
          <WorkspacePanel>
            <EmptyState
              icon={Building2}
              title="No company profile stored"
              description="Edits will require sign-in and org-scoped storage later. Nothing here writes to disk today."
            >
              <PlaceholderButton title="No profile store in this build">
                Edit legal profile (soon)
              </PlaceholderButton>
              <PlaceholderButton title="No brand store in this build">
                Logo & colors (soon)
              </PlaceholderButton>
            </EmptyState>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Organization defaults"
            description="High-level knobs for how quoting, Workstation landing, and schedule habits might default org-wide—rules engines are future work."
          />
          <WorkspacePanel>
            <p className="mb-4 text-sm text-foreground-muted">
              No defaults are applied in this build. When they exist, they should stay
              separate from commercial truth on quotes and from individual user
              preferences.
            </p>
            <div className="flex flex-wrap gap-2">
              <PlaceholderButton title="No rules engine in this build">
                Quote checklist defaults (soon)
              </PlaceholderButton>
              <PlaceholderButton title="No preference store in this build">
                Workstation landing default (soon)
              </PlaceholderButton>
              <PlaceholderButton title="No rules engine in this build">
                Schedule / work habits (soon)
              </PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Team & access (not built)"
            description="Employees, invitations, roles, permissions, payroll, billing, and org security controls belong in future admin systems—not in this placeholder."
          />
          <WorkspacePanel>
            <EmptyState
              icon={Users}
              title="No team or access tools"
              description="No invites, no role matrix, no seat counts, and no audit policy UI. When Struxient ships real org admin, it will not silently reuse this empty shell as if it were complete."
            >
              <PlaceholderButton title="Not built in v5 shell">
                Invite teammate (future)
              </PlaceholderButton>
              <PlaceholderButton title="Not built in v5 shell">
                Roles & permissions (future)
              </PlaceholderButton>
            </EmptyState>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading title="Appearance" />
          <WorkspacePanel>
            <p className="text-sm text-foreground-muted">
              Theme follows the{" "}
              <span className="font-medium text-foreground">
                appearance control in the main header
              </span>
              —per-user and per-device for now; org-branded themes would need persistence
              and policy later.
            </p>
          </WorkspacePanel>
        </section>
      </div>
    </div>
  );
}
