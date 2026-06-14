import Link from "next/link";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { PlaceholderButton } from "@/components/ui/placeholder-button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Users } from "lucide-react";
import { canManageBusinessProfile } from "@/lib/business-profile/business-profile-permissions";
import { getBusinessProfileViewForOrganization } from "@/lib/business-profile/business-profile-service";
import { BusinessProfileSettingsForm } from "./business-profile-settings-form";
import { TeamInviteForm } from "./team-invite-form";
import { TeamInviteRowActions } from "./team-invite-row-actions";
import { AccessControls } from "./access-controls";
import { db } from "@/lib/db";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export default async function OrganizationSettingsPage() {
  const ctx = await getSettingsRequestContextOrThrow();

  const view = await getBusinessProfileViewForOrganization(ctx);
  const canManage = canManageBusinessProfile(ctx.role);
  const profile = view.profile;
  const [memberships, invites, crews, jobs, collaboratorGrants] = await Promise.all([
    db.membership.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true } } },
    }),
    db.organizationInvite.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 20,
    }),
    db.crew.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
      select: { id: true, name: true, archivedAt: true },
    }),
    db.job.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true },
    }),
    db.jobCollaborator.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        job: { select: { title: true } },
        user: { select: { email: true } },
      },
      take: 50,
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Organization" },
        ]}
      />
      <PageHeader
        title="Organization"
        description="Manage company profile and organization-wide defaults for your team."
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
          Keep organization details, branding, and default behavior in one place.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge label="Organization settings" tone="neutral" />
          <span className="text-xs text-foreground-muted">
            Company-level defaults
          </span>
        </div>
      </WorkspacePanel>

      <div className="space-y-8">
        <section>
          <SectionHeading
            title="Business Profile"
            description="Organization defaults used for terminology and AI context assistance."
          />
          <WorkspacePanel>
            <BusinessProfileSettingsForm
              initial={{
                trades: profile?.trades ?? [],
                workTypes: profile?.workTypes ?? [],
                customerMarkets: profile?.customerMarkets ?? [],
                operatingModel: profile?.operatingModel ?? null,
                teamSize: profile?.teamSize ?? null,
              }}
              canManage={canManage}
            />
            {!canManage ? (
              <p className="mt-4 text-xs text-foreground-subtle">
                Office role can view this profile but cannot edit it.
              </p>
            ) : null}
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Organization defaults"
            description="Set default behaviors for quoting, Workstation, and scheduling."
          />
          <WorkspacePanel>
            <p className="mb-4 text-sm text-foreground-muted">
              Choose organization defaults without changing customer records or
              individual user preferences.
            </p>
            <div className="flex flex-wrap gap-2">
              <PlaceholderButton title="Coming in a future update">
                Quote checklist defaults
              </PlaceholderButton>
              <PlaceholderButton title="Coming in a future update">
                Workstation landing default
              </PlaceholderButton>
              <PlaceholderButton title="Coming in a future update">
                Schedule / work habits
              </PlaceholderButton>
            </div>
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Team & access"
            description="Manage invitations, roles, permissions, and account controls."
          />
          <WorkspacePanel>
            {canManage ? (
              <div className="space-y-6">
                <TeamInviteForm />
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                    Current members
                  </p>
                  <ul className="space-y-1 text-sm text-foreground-muted">
                    {memberships.map((membership) => (
                      <li key={membership.id}>
                        {(membership.user.name || membership.user.email || "Unnamed")} - {membership.role}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                    Recent invites
                  </p>
                  {invites.length === 0 ? (
                    <p className="text-sm text-foreground-muted">No invites yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-foreground-muted">
                      {invites.map((invite) => (
                        <li key={invite.id}>
                          {invite.normalizedEmail} - {invite.role} - {invite.status}
                          <TeamInviteRowActions
                            inviteId={invite.id}
                            status={invite.status}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                    Crews and subcontractor access
                  </p>
                  <AccessControls
                    crews={crews.map((crew) => ({
                      id: crew.id,
                      name: crew.name,
                      archived: Boolean(crew.archivedAt),
                    }))}
                    jobs={jobs}
                    collaboratorGrants={collaboratorGrants.map((grant) => ({
                      id: grant.id,
                      jobTitle: grant.job.title,
                      email: grant.user.email ?? "unknown",
                      status: grant.status,
                    }))}
                  />
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No team or access tools"
                description="Invite teammates and manage permissions as these controls roll out."
              >
                <PlaceholderButton title="Coming in a future update">
                  Invite teammate
                </PlaceholderButton>
              </EmptyState>
            )}
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
