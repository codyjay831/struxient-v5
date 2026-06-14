"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInviteAction } from "./accept-actions";
import { Button } from "@/components/ui/button";

export default function InviteAcceptPage({
  params,
}: {
  params: { token: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="mx-auto mt-16 w-full max-w-md rounded-xl border border-border bg-surface p-6">
      <h1 className="text-xl font-semibold text-foreground">Join organization</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        Complete account setup to accept your invitation.
      </p>

      <form
        className="mt-6 space-y-3"
        action={(formData) => {
          startTransition(async () => {
            setError(null);
            const result = await acceptInviteAction(params.token, formData);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push("/workstation");
            router.refresh();
          });
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Name</span>
          <input
            type="text"
            name="name"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-foreground">Password</span>
          <input
            type="password"
            name="password"
            required
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        {error ? (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
          {isPending ? "Accepting invite..." : "Accept invite"}
        </Button>
      </form>
    </div>
  );
}
