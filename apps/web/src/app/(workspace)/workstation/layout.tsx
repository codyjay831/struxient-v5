import { getRequestContextOrThrow } from "@/lib/auth-context";
import { getSpecForRole } from "@/lib/workstation/role-feeds";
import { WorkstationShell } from "@/components/workstation/workstation-shell";
import type { WorkstationLens } from "@/lib/workstation-query";

export default async function WorkstationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getRequestContextOrThrow();
  const spec = getSpecForRole(ctx.role);

  // The landing (attention lens) is always the home base regardless of role spec.
  // We only restrict secondary navigation links (Waiting, All items) by allowedLenses.
  const allowedSecondaryLenses = spec.allowedLenses as WorkstationLens[];

  return (
    <div className="mx-auto max-w-5xl">
      <WorkstationShell allowedSecondaryLenses={allowedSecondaryLenses} />
      {children}
    </div>
  );
}
