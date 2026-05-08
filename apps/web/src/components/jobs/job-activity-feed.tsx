"use client";

import { JobActivityType } from "@prisma/client";
import { SectionHeading } from "@/components/ui/section-heading";
import { History, User as UserIcon, Settings } from "lucide-react";

type Activity = {
  id: string;
  type: JobActivityType;
  title: string;
  details: string | null;
  createdAt: Date;
  actorUser: {
    name: string | null;
    email: string;
  } | null;
};

export function JobActivityFeed({ activities }: { activities: Activity[] }) {
  return (
    <section className="mb-8">
      <SectionHeading
        title="Activity"
        description="Key events and changes recorded for this job. Latest 50 events shown."
      />

      {activities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <History className="mx-auto size-8 text-foreground-subtle/50" />
          <p className="mt-2 text-sm font-medium text-foreground-subtle">No activity recorded yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 h-full w-px bg-border sm:left-5" />

            <div className="space-y-6">
              {activities.map((activity) => (
                <div key={activity.id} className="relative flex items-start gap-4 sm:gap-6">
                  {/* Timeline dot/icon */}
                  <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface sm:size-10">
                    <ActivityIcon type={activity.type} />
                  </div>

                  <div className="min-w-0 flex-1 pt-1.5 sm:pt-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h4 className="text-sm font-semibold text-foreground">{activity.title}</h4>
                      <time
                        dateTime={new Date(activity.createdAt).toISOString()}
                        className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted"
                      >
                        {new Date(activity.createdAt).toLocaleString()}
                      </time>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5 text-xs text-foreground-subtle">
                      {activity.actorUser ? (
                        <>
                          <UserIcon className="size-3" />
                          <span>{activity.actorUser.name || activity.actorUser.email}</span>
                        </>
                      ) : (
                        <>
                          <Settings className="size-3" />
                          <span>System</span>
                        </>
                      )}
                      <span className="text-foreground-muted/50">·</span>
                      <span className="font-mono text-[10px] uppercase opacity-70">
                        {activity.type.replace(/_/g, " ")}
                      </span>
                    </div>

                    {activity.details && (
                      <p className="mt-2 text-xs leading-relaxed text-foreground-muted italic">
                        {activity.details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ActivityIcon({ type }: { type: JobActivityType }) {
  switch (type) {
    case "ISSUE_CREATED":
      return <span className="text-warning-strong">!</span>;
    case "ISSUE_RESOLVED":
      return <span className="text-success-strong">✓</span>;
    case "ISSUE_FOLLOW_UP_TASK_CREATED":
      return <span className="text-foreground-subtle">+</span>;
    case "PAYMENT_REQUIREMENT_CREATED":
      return <span className="text-foreground-subtle">$</span>;
    case "PAYMENT_REQUIREMENT_PAID":
      return <span className="text-success-strong">$</span>;
    case "PAYMENT_REQUIREMENT_WAIVED":
      return <span className="text-foreground-muted">~</span>;
    case "PAYMENT_REQUIREMENT_CANCELED":
      return <span className="text-danger-strong">×</span>;
    default:
      return <Settings className="size-4 text-foreground-subtle" />;
  }
}
