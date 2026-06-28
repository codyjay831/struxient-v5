"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  createBetaInviteAction,
  revokeBetaGrantAction,
  revokeBetaInviteAction,
} from "./beta-access-actions";
import type {
  PlatformBetaGrantListItem,
  PlatformBetaInviteListItem,
} from "@/lib/platform/platform-beta-access";

type BetaAccessClientProps = {
  invites: PlatformBetaInviteListItem[];
  grants: PlatformBetaGrantListItem[];
};

export function BetaAccessClient({ invites, grants }: BetaAccessClientProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onCreateInvite = (formData: FormData) => {
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      setCreatedInviteUrl(null);
      const result = await createBetaInviteAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess("Beta invite created.");
      if (result.inviteUrl) setCreatedInviteUrl(result.inviteUrl);
    });
  };

  const onRevokeInvite = (inviteId: string) => {
    const reason = window.prompt("Reason for revoking this beta invite (required for audit):");
    if (!reason?.trim()) return;

    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const result = await revokeBetaInviteAction(inviteId, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess("Beta invite revoked.");
    });
  };

  const onRevokeGrant = (grantId: string) => {
    const reason = window.prompt("Reason for revoking this beta grant (required for audit):");
    if (!reason?.trim()) return;

    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const result = await revokeBetaGrantAction(grantId, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess("Beta grant revoked.");
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold text-foreground">Create beta invite</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Email-bound signup link. No payment required until beta expires.
        </p>

        <form action={onCreateInvite} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Beta days</span>
            <input
              name="betaDays"
              type="number"
              min={1}
              placeholder="30"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">AI units</span>
            <input
              name="aiIncludedUnits"
              type="number"
              min={0}
              placeholder="50"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input name="aiEnabled" type="checkbox" />
            <span>Enable AI during beta</span>
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium">Reason (audit)</span>
            <input
              name="reason"
              required
              placeholder="Early access for solar contractor pilot"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="md:col-span-2">
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Creating..." : "Create beta invite"}
            </Button>
          </div>
        </form>

        {error ? (
          <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            {success}
          </p>
        ) : null}
        {createdInviteUrl ? (
          <p className="mt-3 break-all rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground-muted">
            Invite link:{" "}
            <a href={createdInviteUrl} className="text-accent hover:underline">
              {createdInviteUrl}
            </a>
          </p>
        ) : success ? (
          <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground-muted">
            Raw invite links are hidden in production. Share access through approved operator workflows.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-surface p-0 overflow-x-auto">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">Beta invites</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-foreground-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Beta days</th>
              <th className="px-4 py-2 font-medium">AI</th>
              <th className="px-4 py-2 font-medium">Expires</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">{invite.normalizedEmail}</td>
                <td className="px-4 py-2">{invite.status}</td>
                <td className="px-4 py-2">{invite.betaDays}</td>
                <td className="px-4 py-2">
                  {invite.aiEnabled
                    ? `${invite.aiIncludedUnits} units`
                    : "Off"}
                </td>
                <td className="px-4 py-2">{format(invite.expiresAt, "MMM d, yyyy")}</td>
                <td className="px-4 py-2">
                  {invite.status === "PENDING" ? (
                    <button
                      type="button"
                      onClick={() => onRevokeInvite(invite.id)}
                      disabled={isPending}
                      className="text-sm text-danger hover:underline"
                    >
                      Revoke
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-border bg-surface p-0 overflow-x-auto">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">Active beta grants</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-foreground-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Organization</th>
              <th className="px-4 py-2 font-medium">Expires</th>
              <th className="px-4 py-2 font-medium">AI</th>
              <th className="px-4 py-2 font-medium">Usage</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant) => {
              const active = !grant.revokedAt && grant.expiresAt > new Date();
              return (
                <tr key={grant.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{grant.organizationName}</td>
                  <td className="px-4 py-2">{format(grant.expiresAt, "MMM d, yyyy")}</td>
                  <td className="px-4 py-2">
                    {grant.aiEnabled ? `${grant.aiIncludedUnits} units` : "Off"}
                  </td>
                  <td className="px-4 py-2">
                    {grant.usedAiUnits} / {grant.aiIncludedUnits}
                  </td>
                  <td className="px-4 py-2">
                    {grant.revokedAt ? "Revoked" : active ? "Active" : "Expired"}
                  </td>
                  <td className="px-4 py-2">
                    {active ? (
                      <button
                        type="button"
                        onClick={() => onRevokeGrant(grant.id)}
                        disabled={isPending}
                        className="text-sm text-danger hover:underline"
                      >
                        Revoke
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
