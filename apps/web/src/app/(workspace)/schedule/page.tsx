import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { queryOrganizationSchedule, type ScheduleView } from "@/lib/schedule-query";
import { ScheduleBoard } from "@/components/schedule/schedule-board";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type SearchParams = {
  view?: string;
  date?: string;
};

function parseView(raw: string | undefined): ScheduleView {
  if (
    raw === "month" ||
    raw === "week" ||
    raw === "day" ||
    raw === "agenda" ||
    raw === "dispatch"
  ) {
    return raw;
  }
  return "week";
}

function getRangeForView(date: Date, view: ScheduleView) {
  const startAt = new Date(date);
  const endAt = new Date(date);

  if (view === "day") {
    startAt.setHours(0, 0, 0, 0);
    endAt.setHours(23, 59, 59, 999);
    return { startAt, endAt };
  }

  if (view === "month") {
    startAt.setDate(1);
    startAt.setHours(0, 0, 0, 0);
    endAt.setMonth(endAt.getMonth() + 1, 0);
    endAt.setHours(23, 59, 59, 999);
    return { startAt, endAt };
  }

  if (view === "agenda") {
    startAt.setHours(0, 0, 0, 0);
    endAt.setDate(endAt.getDate() + 14);
    endAt.setHours(23, 59, 59, 999);
    return { startAt, endAt };
  }

  // week + dispatch share a 7-day range
  const day = startAt.getDay();
  startAt.setDate(startAt.getDate() - day);
  startAt.setHours(0, 0, 0, 0);
  endAt.setTime(startAt.getTime());
  endAt.setDate(endAt.getDate() + 6);
  endAt.setHours(23, 59, 59, 999);
  return { startAt, endAt };
}

export default async function ScheduleRecordPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const parsed = (await searchParams) ?? {};
  const view = parseView(parsed.view);
  const selectedDate = parsed.date ? new Date(parsed.date) : new Date();
  const range = getRangeForView(
    Number.isNaN(selectedDate.getTime()) ? new Date() : selectedDate,
    view,
  );

  const ctx = await getRequestContextOrThrow();
  const [schedule, members] = await Promise.all([
    queryOrganizationSchedule(ctx.organizationId, range),
    db.membership.findMany({
      where: { organizationId: ctx.organizationId },
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
    <div className="mx-auto max-w-6xl space-y-6">
      <WorkspaceBreadcrumb items={[{ label: "Work" }, { label: "Schedule" }]} />
      <PageHeader
        title="Schedule"
        description="Plan estimates, field visits, task timing, and availability in one place."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/schedule?view=month" size="sm" variant={view === "month" ? "primary" : "secondary"}>
              Month
            </ButtonLink>
            <ButtonLink href="/schedule?view=week" size="sm" variant={view === "week" ? "primary" : "secondary"}>
              Week
            </ButtonLink>
            <ButtonLink href="/schedule?view=day" size="sm" variant={view === "day" ? "primary" : "secondary"}>
              Day
            </ButtonLink>
            <ButtonLink href="/schedule?view=agenda" size="sm" variant={view === "agenda" ? "primary" : "secondary"}>
              Agenda
            </ButtonLink>
            <ButtonLink
              href="/schedule?view=dispatch"
              size="sm"
              variant={view === "dispatch" ? "primary" : "secondary"}
            >
              Dispatch
            </ButtonLink>
          </div>
        }
      />

      <ScheduleBoard
        events={schedule.events}
        unscheduled={schedule.unscheduled}
        conflicts={schedule.conflicts}
        members={memberOptions}
        view={view}
      />
    </div>
  );
}
