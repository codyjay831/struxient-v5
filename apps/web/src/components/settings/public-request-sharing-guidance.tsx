const mutedListClass =
  "mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-foreground-muted";

export function PublicRequestSharingGuidance({ className = "" }: { className?: string }) {
  return (
    <details
      className={[
        "rounded-lg border border-border bg-foreground/[0.02] px-4 py-3 text-foreground-muted",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <summary className="cursor-pointer list-none text-sm font-medium text-foreground-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
        Recommended places to share this link
      </summary>
      <p className="mt-2 text-xs leading-relaxed">
        Copy instructions only — there are no live integrations in this version.
      </p>
      <ul className={mutedListClass}>
        <li>Website button</li>
        <li>Google Business Profile</li>
        <li>Facebook</li>
        <li>Instagram</li>
        <li>Email signature</li>
        <li>Text message</li>
        <li>QR code</li>
      </ul>
    </details>
  );
}
