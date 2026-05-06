import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Request unavailable — Struxient",
};

export default function PublicRequestNotFound() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-background px-4 py-16 text-center text-foreground">
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
        Public Intake Form
      </p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">This request link is unavailable</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground-muted">
        The page may have moved, or the business may not accept requests through this link yet.
        If you were sent here from a website or message, contact the business directly.
      </p>
      <p className="mt-8 text-xs text-foreground-subtle">
        <Link href="/" className="underline-offset-4 hover:underline">
          Struxient home
        </Link>
      </p>
    </div>
  );
}
