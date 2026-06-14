"use client";

import { useState, useTransition } from "react";
import { StaffRole } from "@prisma/client";
import { createOrganizationInviteAction } from "./team-actions";
import { Button } from "@/components/ui/button";

const ROLE_OPTIONS: Array<{ value: StaffRole; label: string }> = [
  { value: StaffRole.ADMIN, label: "Admin" },
  { value: StaffRole.OFFICE, label: "Office" },
  { value: StaffRole.FIELD, label: "Field" },
  { value: StaffRole.VIEWER, label: "Viewer" },
  { value: StaffRole.SUBCONTRACTOR, label: "Subcontractor" },
];

export function TeamInviteForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
            defaultValue={StaffRole.FIELD}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
