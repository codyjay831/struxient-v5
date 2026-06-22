"use client";

import { useState, useTransition } from "react";
import { Copy, Link2, RefreshCw, ShieldOff, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { SignatureTimelineDto } from "@/lib/quote-signature/timeline-presenter";
import type { SignatureTimelineArtifact } from "@/lib/quote-workspace-payload";
import {
  copySignerLinkAction,
  confirmManualSignerDeliveryAction,
  resendSignatureRequestAction,
  revokeSignatureRequestAction,
} from "@/app/(workspace)/quotes/quote-signature-staff-actions";

export function QuoteSignatureTimelinePanel({
  timeline,
  artifacts,
  canViewRawAudit,
}: {
  timeline: SignatureTimelineDto | null;
  artifacts: SignatureTimelineArtifact[];
  canViewRawAudit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [copiedRecipientId, setCopiedRecipientId] = useState<string | null>(null);
  const showRawAudit = canViewRawAudit;

  if (!timeline) {
    return (
      <p className="text-xs text-foreground-muted italic">
        No signature request yet. Send the quote to create a Standard Acceptance request.
      </p>
    );
  }

  const handleResend = () => {
    startTransition(async () => {
      const result = await resendSignatureRequestAction(timeline.requestId);
      if (result.error) toast.error(result.error);
      else toast.success("Signature request resent.");
    });
  };

  const handleRevoke = () => {
    if (!confirm("Revoke this signature request? Signers will no longer be able to accept.")) return;
    startTransition(async () => {
      const result = await revokeSignatureRequestAction(timeline.requestId);
      if (result.error) toast.error(result.error);
      else toast.success("Signature request revoked.");
    });
  };

  const handleCopyLink = (recipientId: string) => {
    startTransition(async () => {
      const result = await copySignerLinkAction(timeline.requestId, recipientId);
      if (result.error || !result.signerUrl) {
        toast.error(result.error ?? "Failed to copy link.");
        return;
      }
      await navigator.clipboard.writeText(result.signerUrl);
      setCopiedRecipientId(recipientId);
      toast.warning("Signer link copied. Anyone with this link can sign as that recipient.");
    });
  };

  const handleManualDelivery = (recipientId: string) => {
    startTransition(async () => {
      const result = await confirmManualSignerDeliveryAction(timeline.requestId, recipientId);
      if (result.error) toast.error(result.error);
      else toast.success("Manual delivery recorded.");
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
            Signature request
          </p>
          <p className="text-sm font-semibold text-foreground">{timeline.statusLabel}</p>
          <p className="text-xs text-foreground-muted">
            Method: {timeline.mode === "STANDARD_ACCEPTANCE" ? "Standard Acceptance" : timeline.mode}
          </p>
        </div>
        {timeline.status !== "ACCEPTED" && timeline.status !== "REVOKED" ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleResend}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-medium text-foreground hover:bg-foreground/[0.03]"
            >
              <RefreshCw className="size-3" />
              Resend
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleRevoke}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-medium text-danger hover:bg-danger/5"
            >
              <ShieldOff className="size-3" />
              Revoke
            </button>
          </div>
        ) : null}
      </div>

      {timeline.status === "DELIVERY_FAILED" ? (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <p>Email delivery failed or is not configured. Copy the signer link or confirm manual delivery.</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Recipients</p>
        {timeline.recipients.map((r) => (
          <div key={r.id} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">{r.name || r.email || "Signer"}</p>
                <p className="text-foreground-muted">{r.statusLabel}</p>
                {r.acceptedByName ? (
                  <p className="text-foreground-muted">Accepted by: {r.acceptedByName}</p>
                ) : null}
              </div>
              {timeline.status !== "ACCEPTED" && timeline.status !== "REVOKED" ? (
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleCopyLink(r.id)}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px]"
                    title="Copy signer link — records audit event"
                  >
                    <Copy className="size-3" />
                    {copiedRecipientId === r.id ? "Copied" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleManualDelivery(r.id)}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px]"
                  >
                    <Link2 className="size-3" />
                    Manual sent
                  </button>
                </div>
              ) : null}
            </div>
            {r.deliveries.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[10px] text-foreground-muted">
                {r.deliveries.map((d, i) => (
                  <li key={i}>
                    {d.channel} — {d.status} ({new Date(d.attemptedAt).toLocaleString()})
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>

      {artifacts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Artifacts</p>
          <ul className="space-y-1 text-xs">
            {artifacts.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/quotes/signature-artifacts/${a.id}`}
                  className="text-accent underline underline-offset-2"
                >
                  {a.kind.replaceAll("_", " ").toLowerCase()}
                </a>
                <span className="ml-2 text-[10px] text-foreground-subtle font-mono">
                  {a.sha256.slice(0, 12)}…
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Timeline</p>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-[11px] text-foreground-muted">
          {timeline.events.map((e) => (
            <li key={e.id}>
              <span className="text-foreground-subtle">{new Date(e.occurredAt).toLocaleString()}</span>
              {" — "}
              {e.label}
              {showRawAudit && e.metadata?.kind === "SIGNER_NAME_MISMATCH" ? (
                <span className="text-warning"> (name mismatch)</span>
              ) : null}
              {showRawAudit && e.ipAddress ? (
                <span className="block pl-4 font-mono text-[10px] text-foreground-subtle">
                  IP: {e.ipAddress}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
