"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StaffRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  MANAGEABLE_MEMBER_ROLES,
  getMembershipEditRestriction,
  type MembershipActorContext,
} from "@/lib/team/team-membership-rules";
import { removeMembershipAction, updateMembershipRoleAction } from "./member-actions";

const ROLE_LABELS: Record<StaffRole, string> = {
  [StaffRole.OWNER]: "Owner",
  [StaffRole.ADMIN]: "Admin",
  [StaffRole.OFFICE]: "Office",
  [StaffRole.FIELD]: "Field",
  [StaffRole.VIEWER]: "Viewer",
  [StaffRole.SUBCONTRACTOR]: "Subcontractor",
};

export function TeamMemberRow({
  membershipId,
  userId,
  name,
  email,
  role,
  joinedAt,
  actor,
}: {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: StaffRole;
  joinedAt: string;
  actor: MembershipActorContext;
}) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<StaffRole>(
    role === StaffRole.OWNER ? StaffRole.ADMIN : role,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const target = { membershipId, userId, role };
  const editRestriction = getMembershipEditRestriction(actor, target);
  const canEditRole = editRestriction === null;

  const joinedLabel = new Date(joinedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <li className="rounded-lg border border-border px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {name || email || "Unnamed member"}
          </p>
          {email ? <p className="text-xs text-foreground-muted">{email}</p> : null}
          <p className="mt-1 text-xs text-foreground-subtle">Joined {joinedLabel}</p>
        </div>
        <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
          {role === StaffRole.OWNER && !canEditRole ? (
            <span className="rounded-md bg-brand-muted px-2 py-1 text-xs font-medium text-accent">
              Owner
            </span>
          ) : canEditRole ? (
            <select
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value as StaffRole)}
              disabled={isPending}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground sm:w-auto"
            >
              {MANAGEABLE_MEMBER_ROLES.map((memberRole) => (
                <option key={memberRole} value={memberRole}>
                  {ROLE_LABELS[memberRole]}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-foreground-muted">{ROLE_LABELS[role]}</span>
          )}
        </div>
      </div>

      {editRestriction ? (
        <p className="mt-2 text-xs text-foreground-muted">{editRestriction}</p>
      ) : null}

      <div className="mt-2 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        {canEditRole && selectedRole !== role ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full sm:w-auto"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                setMessage(null);
                setError(null);
                const result = await updateMembershipRoleAction(membershipId, selectedRole);
                if (!result.ok) {
                  setError(result.error ?? "Could not update role.");
                  return;
                }
                setMessage("Role updated.");
                router.refresh();
              });
            }}
          >
            Save role
          </Button>
        ) : null}

        {canEditRole ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full sm:w-auto"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm("Remove this member from the organization?")) {
                return;
              }
              startTransition(async () => {
                setMessage(null);
                setError(null);
                const result = await removeMembershipAction(membershipId);
                if (!result.ok) {
                  setError(result.error ?? "Could not remove member.");
                  return;
                }
                setMessage("Member removed.");
                router.refresh();
              });
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>

      {message ? <p className="mt-2 text-xs text-foreground-muted">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </li>
  );
}
