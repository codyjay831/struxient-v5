"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type ShareChannel = {
  label: string;
  snippet: (url: string) => string;
};

const SHARE_CHANNELS: ShareChannel[] = [
  {
    label: "Text message",
    snippet: (url) => `Hi! You can request service here: ${url}`,
  },
  {
    label: "Email signature",
    snippet: (url) => `Request service online: ${url}`,
  },
  {
    label: "Google Business Profile",
    snippet: (url) => url,
  },
  {
    label: "Website button",
    snippet: (url) => url,
  },
];

function CopySnippetButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[0.65rem] font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
    >
      {copied ? (
        <>
          <Check className="size-3" aria-hidden />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" aria-hidden />
          Copy
        </>
      )}
    </button>
  );
}

export function PublicRequestSharingGuidance({
  url,
  className = "",
}: {
  url: string | null;
  className?: string;
}) {
  if (!url) {
    return null;
  }

  return (
    <details
      className={[
        "rounded-lg border border-border bg-foreground/[0.02] px-4 py-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <summary className="cursor-pointer list-none text-sm font-medium text-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        Share your link
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
        Copy-ready snippets for common places contractors share request links.
      </p>
      <ul className="mt-3 space-y-2">
        {SHARE_CHANNELS.map((channel) => {
          const snippet = channel.snippet(url);
          return (
            <li
              key={channel.label}
              className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{channel.label}</p>
                <p className="mt-0.5 break-all font-mono text-[0.65rem] leading-relaxed text-foreground-muted">
                  {snippet}
                </p>
              </div>
              <CopySnippetButton text={snippet} />
            </li>
          );
        })}
      </ul>
    </details>
  );
}
