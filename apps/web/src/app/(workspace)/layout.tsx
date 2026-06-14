import { AppShell } from "@/components/shell/app-shell";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getRequestContextOrThrow();
  const memberships = await db.membership.findMany({
    where: { userId: ctx.userId },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { id: true, name: true } } },
  });

  return (
    <AppShell
      role={ctx.role}
      organizations={memberships.map((membership) => ({
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
      }))}
      activeOrganizationId={ctx.organizationId}
    >
      {children}
    </AppShell>
  );
}
