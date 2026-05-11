"use client";

import { useState, useTransition } from "react";
import { JobVisitStatus } from "@prisma/client";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { 
  Calendar, 
  Clock, 
  User as UserIcon, 
  Plus, 
  X, 
  Check, 
  CalendarClock,
  MoreVertical
} from "lucide-react";
import { 
  createJobVisitAction, 
  cancelJobVisitAction, 
  completeJobVisitAction 
} from "@/app/(workspace)/jobs/job-visit-actions";

type Visit = {
  id: string;
  scheduledStartAt: Date;
  scheduledEndAt: Date | null;
  status: JobVisitStatus;
  notes: string | null;
  assignedUser: {
    name: string | null;
    email: string | null;
  } | null;
};

export function JobVisitManager({ 
  jobId, 
  initialVisits 
}: { 
  jobId: string; 
  initialVisits: Visit[] 
}) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  
  // Form state
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [notes, setNotes] = useState("");

  const upcomingVisits = initialVisits
    .filter(v => v.status === JobVisitStatus.SCHEDULED)
    .sort((a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime());
    
  const pastVisits = initialVisits
    .filter(v => v.status !== JobVisitStatus.SCHEDULED)
    .sort((a, b) => b.scheduledStartAt.getTime() - a.scheduledStartAt.getTime());

  const handleSchedule = () => {
    if (!startDate || !startTime) {
      alert("Please select a date and time.");
      return;
    }

    const scheduledStartAt = new Date(`${startDate}T${startTime}`);
    
    startTransition(async () => {
      const result = await createJobVisitAction(jobId, {
        scheduledStartAt,
        notes: notes || undefined,
      });
      
      if (result.error) {
        alert(result.error);
      } else {
        setShowForm(false);
        setStartDate("");
        setStartTime("");
        setNotes("");
      }
    });
  };

  const handleCancel = (visitId: string) => {
    if (!confirm("Are you sure you want to cancel this visit?")) return;
    
    startTransition(async () => {
      const result = await cancelJobVisitAction(visitId);
      if (result.error) alert(result.error);
    });
  };

  const handleComplete = (visitId: string) => {
    startTransition(async () => {
      const result = await completeJobVisitAction(visitId);
      if (result.error) alert(result.error);
    });
  };

  return (
    <section className="mb-8">
      <SectionHeading
        title="Scheduling"
        description="Manage job visits and field appointments."
        actions={
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            {showForm ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {showForm ? "Cancel" : "Schedule Visit"}
          </button>
        }
      />

      {showForm && (
        <WorkspacePanel className="mb-4 border-dashed border-accent/30 bg-accent/5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                Date
              </label>
              <input
                type="date"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                Time
              </label>
              <input
                type="time"
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                Notes (Optional)
              </label>
              <textarea
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-border-strong focus:outline-none"
                rows={2}
                placeholder="What is the goal of this visit?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSchedule}
              disabled={isPending}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-contrast hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Scheduling..." : "Confirm Schedule"}
            </button>
          </div>
        </WorkspacePanel>
      )}

      <div className="space-y-3">
        {upcomingVisits.length === 0 && !showForm && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <CalendarClock className="mx-auto size-6 text-foreground-subtle/40" />
            <p className="mt-2 text-xs text-foreground-muted">No upcoming visits scheduled.</p>
          </div>
        )}

        {upcomingVisits.map((visit) => (
          <div 
            key={visit.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md bg-accent/10 p-2 text-accent">
                <Calendar className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {new Date(visit.scheduledStartAt).toLocaleDateString(undefined, { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    })}
                  </p>
                  <StatusBadge label="Scheduled" tone="sent" />
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-foreground-muted">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {new Date(visit.scheduledStartAt).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                  {visit.assignedUser && (
                    <span className="flex items-center gap-1">
                      <UserIcon className="size-3" />
                      {visit.assignedUser.name || visit.assignedUser.email}
                    </span>
                  )}
                </div>
                {visit.notes && (
                  <p className="mt-2 text-xs italic text-foreground-subtle">
                    &quot;{visit.notes}&quot;
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleComplete(visit.id)}
                disabled={isPending}
                className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-foreground-subtle hover:border-border-strong hover:text-success-strong transition-colors"
                title="Mark Completed"
              >
                <Check className="size-4" />
              </button>
              <button
                onClick={() => handleCancel(visit.id)}
                disabled={isPending}
                className="flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-foreground-subtle hover:border-border-strong hover:text-danger-strong transition-colors"
                title="Cancel Visit"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        ))}

        {pastVisits.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-3 text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
              Past Visits
            </h4>
            <div className="space-y-2 opacity-70">
              {pastVisits.slice(0, 3).map((visit) => (
                <div 
                  key={visit.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface/50 p-2 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-foreground">
                      {new Date(visit.scheduledStartAt).toLocaleDateString()}
                    </span>
                    <StatusBadge 
                      label={visit.status === JobVisitStatus.COMPLETED ? "Completed" : "Canceled"} 
                      tone={visit.status === JobVisitStatus.COMPLETED ? "approved" : "neutral"} 
                    />
                  </div>
                  <span className="text-foreground-muted">
                    {new Date(visit.scheduledStartAt).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
