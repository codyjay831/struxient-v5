"use client";

import { useState } from "react";

const buttonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

export function CopyPublicRequestUrlButton({ url }: { url: string }) {
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
    <button type="button" className={buttonClass} onClick={() => void copy()}>
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
