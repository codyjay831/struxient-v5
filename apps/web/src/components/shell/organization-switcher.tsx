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
    <label className="inline-flex min-w-0 max-w-[9rem] items-center gap-1 text-sm text-foreground-muted sm:max-w-none sm:gap-2">
      <span className="hidden sm:inline">Org</span>
      <select
        disabled={isPending}
        defaultValue={activeOrganizationId}
        className="min-w-0 max-w-full truncate rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
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

