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
    <label className="flex w-full flex-col gap-1 text-xs font-medium text-foreground-muted">
      <span className="px-1">Organization</span>
      <select
        disabled={isPending}
        defaultValue={activeOrganizationId}
        className="w-full truncate rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

