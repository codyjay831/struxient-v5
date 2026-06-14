"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  addCrewMemberAction,
  archiveCrewAction,
  createCrewAction,
  grantJobCollaboratorAction,
  revokeJobCollaboratorAction,
} from "./access-actions";

type CrewOption = { id: string; name: string; archived: boolean };
type JobOption = { id: string; title: string };
type CollaboratorGrant = {
  id: string;
  jobTitle: string;
  email: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
};

export function AccessControls({
  crews,
  jobs,
  collaboratorGrants,
}: {
  crews: CrewOption[];
  jobs: JobOption[];
  collaboratorGrants: CollaboratorGrant[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeCrews = crews.filter((crew) => !crew.archived);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Crews
        </p>
        <p className="text-sm text-foreground-muted">
          Crew membership expands FIELD visibility through assignment-linked crews only.
        </p>
        <form
          className="flex flex-wrap gap-2"
          action={(formData) => {
            startTransition(async () => {
              setMessage(null);
              setError(null);
              const result = await createCrewAction(formData);
              if (!result.ok) {
                setError(result.error ?? "Could not create crew.");
                return;
              }
              setMessage("Crew created.");
            });
          }}
        >
          <input
            type="text"
            name="name"
            required
            placeholder="New crew name"
            className="min-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <Button type="submit" size="sm" variant="primary" disabled={isPending}>
            Create crew
          </Button>
        </form>

        <form
          className="flex flex-wrap gap-2"
          action={(formData) => {
            startTransition(async () => {
              setMessage(null);
              setError(null);
              const result = await addCrewMemberAction(formData);
              if (!result.ok) {
                setError(result.error ?? "Could not add crew member.");
                return;
              }
              setMessage("Crew member added.");
            });
          }}
        >
          <select
            name="crewId"
            required
            className="min-w-[180px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            defaultValue=""
          >
            <option value="" disabled>
              Select crew
            </option>
            {activeCrews.map((crew) => (
              <option key={crew.id} value={crew.id}>
                {crew.name}
              </option>
            ))}
          </select>
          <input
            type="email"
            name="email"
            required
            placeholder="member@company.com"
            className="min-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
            Add member
          </Button>
        </form>

        <ul className="space-y-1 text-sm text-foreground-muted">
          {crews.length === 0 ? (
            <li>No crews yet.</li>
          ) : (
            crews.map((crew) => (
              <li key={crew.id}>
                {crew.name} {crew.archived ? "(archived)" : ""}
                {!crew.archived ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-2"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        setMessage(null);
                        setError(null);
                        const result = await archiveCrewAction(crew.id);
                        if (!result.ok) {
                          setError(result.error ?? "Could not archive crew.");
                          return;
                        }
                        setMessage("Crew archived.");
                      });
                    }}
                  >
                    Archive
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          Subcontractor job access
        </p>
        <p className="text-sm text-foreground-muted">
          SUBCONTRACTOR role alone grants no job access; each job requires an active grant.
        </p>
        <form
          className="flex flex-wrap gap-2"
          action={(formData) => {
            startTransition(async () => {
              setMessage(null);
              setError(null);
              const result = await grantJobCollaboratorAction(formData);
              if (!result.ok) {
                setError(result.error ?? "Could not grant collaborator access.");
                return;
              }
              setMessage("Collaborator access granted.");
            });
          }}
        >
          <select
            name="jobId"
            required
            className="min-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            defaultValue=""
          >
            <option value="" disabled>
              Select job
            </option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>
          <input
            type="email"
            name="email"
            required
            placeholder="sub@partner.com"
            className="min-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
            Grant
          </Button>
        </form>

        <ul className="space-y-1 text-sm text-foreground-muted">
          {collaboratorGrants.length === 0 ? (
            <li>No collaborator grants yet.</li>
          ) : (
            collaboratorGrants.map((grant) => (
              <li key={grant.id}>
                {grant.email} - {grant.jobTitle} - {grant.status}
                {grant.status === "ACTIVE" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-2"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        setMessage(null);
                        setError(null);
                        const result = await revokeJobCollaboratorAction(grant.id);
                        if (!result.ok) {
                          setError(result.error ?? "Could not revoke collaborator.");
                          return;
                        }
                        setMessage("Collaborator access revoked.");
                      });
                    }}
                  >
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>

      {message ? (
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground-muted">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

