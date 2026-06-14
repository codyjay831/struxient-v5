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
    <div className="mt-1 flex items-center gap-2">
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
            setMessage(result.emailed ? "Invite email re-sent." : `Share link: ${result.inviteUrl ?? ""}`);
          });
        }}
      >
        Resend
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
        Revoke
      </Button>
      {message ? <span className="text-xs text-foreground-muted">{message}</span> : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}

