"use client";

import { useState, useTransition } from "react";
import { StaffRole } from "@prisma/client";
import { createOrganizationInviteAction } from "./team-actions";
import { Button } from "@/components/ui/button";
import { MANAGEABLE_MEMBER_ROLES } from "@/lib/team/team-membership-rules";

const ROLE_OPTIONS: Array<{ value: StaffRole; label: string; hint: string }> = [
  { value: StaffRole.ADMIN, label: "Admin", hint: "Full org settings except owner-only actions." },
  { value: StaffRole.OFFICE, label: "Office", hint: "Sales, customers, quotes, and scheduling." },
  { value: StaffRole.FIELD, label: "Field", hint: "Assigned jobs and tasks only." },
  { value: StaffRole.VIEWER, label: "Viewer", hint: "Read-only across the organization." },
  {
    value: StaffRole.SUBCONTRACTOR,
    label: "Subcontractor",
    hint: "No org-wide access; requires per-job grants in Field access.",
  },
];

export function TeamInviteForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<StaffRole>(StaffRole.FIELD);

  const selectedHint = ROLE_OPTIONS.find((option) => option.value === selectedRole)?.hint;

  return (
    <form
      className="space-y-3"
      action={(formData) => {
        startTransition(async () => {
          setError(null);
          setSuccess(null);
          const result = await createOrganizationInviteAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          if (result.emailed) {
            setSuccess("Invite created and emailed.");
            return;
          }
          setSuccess(`Invite created. Share this link: ${result.inviteUrl}`);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Email</span>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            placeholder="teammate@company.com"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Role</span>
          <select
            name="role"
            value={selectedRole}
            onChange={(event) => setSelectedRole(event.target.value as StaffRole)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {selectedHint ? (
            <p className="mt-1.5 text-xs text-foreground-muted">{selectedHint}</p>
          ) : null}
        </label>
      </div>

      {error ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground-muted">
          {success}
        </p>
      ) : null}

      <Button type="submit" variant="primary" size="sm" disabled={isPending}>
        {isPending ? "Creating invite..." : "Create invite"}
      </Button>
    </form>
  );
}
