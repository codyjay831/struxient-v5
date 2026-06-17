import { PageHeader } from "@/components/ui/page-header";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { queryOrganizationSchedule } from "@/lib/schedule-query";
import { ScheduleBoard } from "@/components/schedule/schedule-board";
import { db } from "@/lib/db";
import { isAssignmentScopedRole } from "@/lib/authz/resource-access";
import { getOrgTimezone } from "@/lib/scheduling/deadline-timezone";
import {
  getScheduleRangeForView,
  toScheduleQueryRange,
} from "@/lib/scheduling/schedule-range";
import {
  parseScheduleUrlState,
  type ScheduleUrlView,
} from "@/lib/scheduling/schedule-url-state";

export const dynamic = "force-dynamic";

type SearchParams = {
  view?: string;
  date?: string;
};

export default async function ScheduleRecordPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const parsedParams = (await searchParams) ?? {};
  const ctx = await getRequestContextOrThrow();

  const organization = await db.organization.findFirstOrThrow({
    where: { id: ctx.organizationId },
    select: { timezone: true },
  });
  const timeZone = getOrgTimezone(organization.timezone);
  const urlState = parseScheduleUrlState(parsedParams, timeZone);
  const queryView: ScheduleUrlView = urlState.view ?? "week";
  const halfOpenRange = getScheduleRangeForView(urlState.date, queryView, timeZone);
  const range = toScheduleQueryRange(halfOpenRange);

  const [schedule, members] = await Promise.all([
    queryOrganizationSchedule(ctx.organizationId, range, ctx.role, ctx.userId),
    db.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(isAssignmentScopedRole(ctx.role) ? { userId: ctx.userId } : {}),
      },
      select: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const memberOptions = members.map((membership) => ({
    id: membership.user.id,
    label: membership.user.name || membership.user.email || "Unnamed user",
  }));

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <PageHeader variant="compact" title="Schedule" />

      <ScheduleBoard
        events={schedule.events}
        unscheduled={schedule.unscheduled}
        conflicts={schedule.conflicts}
        members={memberOptions}
        anchorDate={urlState.date}
        view={urlState.view}
        timeZone={timeZone}
      />
    </div>
  );
}
