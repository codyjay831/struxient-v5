import { notFound } from "next/navigation";
import Link from "next/link";
import { peekPortalMagicLink } from "@/lib/customer-portal/verify-service";
import { openPortalFromMagicLinkAction } from "@/app/portal/portal-entry-actions";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function PortalEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await peekPortalMagicLink(token);
  if (!preview) {
    notFound();
  }

  async function openPortal() {
    "use server";
    await openPortalFromMagicLinkAction(token);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-elevated)]">
        <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
          Customer Project Portal
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{preview.projectTitle}</h1>
        <p className="mt-2 text-sm text-foreground-muted">{preview.companyName}</p>
        <p className="mt-4 text-sm leading-relaxed text-foreground-muted">
          Open your secure project hub to see status, next steps, schedule, documents, and payments.
        </p>
        <form action={openPortal} className="mt-6">
          <Button type="submit" variant="primary" className="w-full">
            Open project portal
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-foreground-subtle">
          This is a secure link for project access only — not a contractor login.
        </p>
        <p className="mt-2 text-center text-xs text-foreground-subtle">
          <Link href="/" className="underline-offset-4 hover:underline">
            Powered by Struxient
          </Link>
        </p>
      </div>
    </main>
  );
}
