"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchActiveOrganizationAction } from "./organization-switcher-actions";

type OrganizationOption = {
  organizationId: string;
  organizationName: string;
};

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrganizationOption[];
  activeOrganizationId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (organizations.length <= 1) {
    return null;
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-foreground-muted">
      <span>Org</span>
      <select
        disabled={isPending}
        defaultValue={activeOrganizationId}
        className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
        onChange={(event) => {
          const nextOrgId = event.currentTarget.value;
          startTransition(async () => {
            await switchActiveOrganizationAction(nextOrgId);
            router.refresh();
          });
        }}
      >
        {organizations.map((org) => (
          <option key={org.organizationId} value={org.organizationId}>
            {org.organizationName}
          </option>
        ))}
      </select>
    </label>
  );
}

