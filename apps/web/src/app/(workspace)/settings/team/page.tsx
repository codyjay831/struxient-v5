import Link from "next/link";
import { getSettingsRequestContextOrNull } from "@/lib/auth-context";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { AccessDeniedPanel } from "@/components/ui/access-denied-panel";
import { TeamInviteForm } from "./team-invite-form";
import { TeamInviteRowActions } from "./team-invite-row-actions";
import { TeamMemberRow } from "./team-member-row";
import { db } from "@/lib/db";
import { countOwners } from "@/lib/team/team-membership-rules";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

const INVITE_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  REVOKED: "Revoked",
  EXPIRED: "Expired",
};

function formatInviteDate(value: Date | null): string {
  if (!value) return "—";
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function TeamSettingsPage() {
  const ctx = await getSettingsRequestContextOrNull();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-5xl">
        <WorkspaceBreadcrumb
          items={[
            { label: "Settings", href: "/settings" },
            { label: "Team" },
          ]}
        />
        <PageHeader title="Team" description="Invite teammates and manage roles." />
        <AccessDeniedPanel
          description="Only Owners and Admins can manage team members and invitations."
          backHref="/settings"
          backLabel="Back to Settings"
        />
      </div>
    );
  }

  const [memberships, invites] = await Promise.all([
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
  ]);

  const actor = {
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    ownerCount: countOwners(memberships),
  };

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "Team" },
        ]}
      />
      <PageHeader
        title="Team"
        description="Invite teammates and manage roles."
        actions={
          <>
            <Link href="/settings" className={listLinkClass}>
              ← All settings
            </Link>
            <Link href="/settings/field-access" className={listLinkClass}>
              Field access
            </Link>
          </>
        }
      />

      <div className="space-y-8">
        <section>
          <SectionHeading
            title="Invite teammate"
            description="Send an email invite or share a link. Role is set at invite time and can be changed after they join."
          />
          <WorkspacePanel>
            <TeamInviteForm />
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Members"
            description="Active organization members and their roles."
          />
          <WorkspacePanel>
            {memberships.length === 0 ? (
              <p className="text-sm text-foreground-muted">No members yet.</p>
            ) : (
              <ul className="space-y-2">
                {memberships.map((membership) => (
                  <TeamMemberRow
                    key={membership.id}
                    membershipId={membership.id}
                    userId={membership.userId}
                    name={membership.user.name}
                    email={membership.user.email}
                    role={membership.role}
                    joinedAt={membership.createdAt.toISOString()}
                    actor={actor}
                  />
                ))}
              </ul>
            )}
          </WorkspacePanel>
        </section>

        <section>
          <SectionHeading
            title="Invites"
            description="Pending and recent invitations."
          />
          <WorkspacePanel>
            {invites.length === 0 ? (
              <p className="text-sm text-foreground-muted">No invites yet.</p>
            ) : (
              <ul className="space-y-3 text-sm text-foreground-muted">
                {invites.map((invite) => (
                  <li key={invite.id} className="rounded-lg border border-border px-3 py-2">
                    <p className="font-medium text-foreground">
                      {invite.normalizedEmail} · {invite.role}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {INVITE_STATUS_LABELS[invite.status] ?? invite.status}
                      {invite.status === "PENDING" ? (
                        <>
                          {" "}
                          · Expires {formatInviteDate(invite.expiresAt)}
                          {invite.lastSentAt ? ` · Last sent ${formatInviteDate(invite.lastSentAt)}` : null}
                        </>
                      ) : null}
                    </p>
                    <TeamInviteRowActions inviteId={invite.id} status={invite.status} />
                  </li>
                ))}
              </ul>
            )}
          </WorkspacePanel>
        </section>
      </div>
    </div>
  );
}
