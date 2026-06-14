import { PlatformShell } from "@/components/platform/platform-shell";
import { getPlatformContext } from "@/lib/platform/platform-context";

export const dynamic = "force-dynamic";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getPlatformContext();
  return <PlatformShell requestId={ctx.requestId}>{children}</PlatformShell>;
}
