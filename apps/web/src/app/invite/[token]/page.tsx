"use client";

import { use, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInviteAction } from "./accept-actions";
import { Button } from "@/components/ui/button";

export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const resolvedParams = use(params);
  const debugParams = params as unknown as { then?: unknown; token?: unknown };

  // #region agent log
  fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "aa0468" },
    body: JSON.stringify({
      sessionId: "aa0468",
      runId: "initial",
      hypothesisId: "A,B,D",
      location: "apps/web/src/app/invite/[token]/page.tsx:18",
      message: "Invite page render param shape",
      data: {
        paramsType: typeof params,
        paramsHasThen: typeof debugParams.then === "function",
        ownKeys: Object.keys(debugParams).slice(0, 5),
        isPending,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

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
            // #region agent log
            fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "aa0468" },
              body: JSON.stringify({
                sessionId: "aa0468",
                runId: "initial",
                hypothesisId: "A,B,C",
                location: "apps/web/src/app/invite/[token]/page.tsx:52",
                message: "Invite form submitted before token read",
                data: {
                  paramsType: typeof params,
                  paramsHasThen: typeof debugParams.then === "function",
                  formHasName: formData.has("name"),
                  formHasPassword: formData.has("password"),
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            const token = resolvedParams.token;
            // #region agent log
            fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "aa0468" },
              body: JSON.stringify({
                sessionId: "aa0468",
                runId: "initial",
                hypothesisId: "A,C",
                location: "apps/web/src/app/invite/[token]/page.tsx:70",
                message: "Invite token read result",
                data: {
                  tokenType: typeof token,
                  tokenLength: typeof token === "string" ? token.length : null,
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            const result = await acceptInviteAction(token, formData);
            // #region agent log
            fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "aa0468" },
              body: JSON.stringify({
                sessionId: "aa0468",
                runId: "initial",
                hypothesisId: "C",
                location: "apps/web/src/app/invite/[token]/page.tsx:86",
                message: "Invite action returned",
                data: {
                  ok: result.ok,
                  error: result.ok ? null : result.error,
                },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
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
