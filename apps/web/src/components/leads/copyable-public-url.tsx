"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const buttonClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

export function CopyablePublicUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      <button
        type="button"
        onClick={() => void copy()}
        className="group min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-foreground/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={copied ? "Link copied" : "Click to copy customer request link"}
      >
        <p className="break-all font-mono text-sm leading-relaxed text-foreground">{url}</p>
        <p className="mt-1 text-[0.65rem] text-foreground-subtle group-hover:text-foreground-muted">
          {copied ? "Copied to clipboard" : "Click to copy"}
        </p>
      </button>
      <button type="button" className={buttonClass} onClick={() => void copy()}>
        {copied ? (
          <>
            <Check className="size-3.5" aria-hidden />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5" aria-hidden />
            Copy link
          </>
        )}
      </button>
    </div>
  );
}
