"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendOrganizationInviteAction, revokeOrganizationInviteAction } from "./team-actions";

export function TeamInviteRowActions({
  inviteId,
  status,
}: {
  inviteId: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (status !== "PENDING") {
    return null;
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setMessage(null);
            setError(null);
            const result = await resendOrganizationInviteAction(inviteId);
            if (!result.ok) {
              setError(result.error ?? "Could not resend invite.");
              return;
            }
            if (result.emailed) {
              setMessage("Invite email re-sent.");
              return;
            }
            if (result.inviteUrl) {
              setMessage(`Share link: ${result.inviteUrl}`);
              return;
            }
            setMessage("Invite refreshed. Email delivery is unavailable in this environment.");
          });
        }}
      >
        Resend invite
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setMessage(null);
            setError(null);
            const result = await revokeOrganizationInviteAction(inviteId);
            if (!result.ok) {
              setError(result.error ?? "Could not revoke invite.");
              return;
            }
            setMessage("Invite revoked.");
          });
        }}
      >
        Revoke invite
      </Button>
      {message ? <span className="text-xs text-foreground-muted">{message}</span> : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
