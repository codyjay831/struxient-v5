"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  parseLeadListSearchParams,
  LEAD_LIST_DEFAULT_SORT,
  LEAD_LIST_DEFAULT_PIPELINE,
  serializeLeadListHref,
  type LeadListSortParam,
  type LeadListPipelineParam,
} from "@/lib/lead-list-query";

export function LeadListToolbar({
  q,
  sort,
  pipeline,
  matchingCount,
  totalInOrg,
  hasActiveListFilters,
}: {
  q: string;
  sort: LeadListSortParam;
  pipeline: LeadListPipelineParam;
  matchingCount: number;
  totalInOrg: number;
  hasActiveListFilters: boolean;
}) {
  const router = useRouter();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sortField = fd.get("sort");
    const pipelineField = fd.get("pipeline");
    const { q: nextQ, sort: nextSort, pipeline: nextPipeline } =
      parseLeadListSearchParams({
        q: String(fd.get("q") ?? ""),
        sort: typeof sortField === "string" ? sortField : undefined,
        pipeline: typeof pipelineField === "string" ? pipelineField : undefined,
      });
    router.push(
      serializeLeadListHref({
        q: nextQ,
        sort: nextSort,
        pipeline: nextPipeline,
      }),
      { scroll: false },
    );
  }

  const pipelineOptions: { value: LeadListPipelineParam; label: string }[] = [
    { value: "needs_action", label: "Needs action" },
    { value: "waiting", label: "Waiting" },
    { value: "scheduled", label: "Scheduled" },
    { value: "awarded", label: "Awarded" },
    { value: "closed", label: "Closed" },
    { value: "all", label: "All" },
  ];

  const sortOptions: { value: LeadListSortParam; label: string }[] = [
    { value: "created", label: "Newest created" },
    { value: "updated", label: "Recently updated" },
    { value: "title_asc", label: "Title A–Z" },
    { value: "age_asc", label: "Oldest first" },
  ];

  return (
    <div className="flex flex-col gap-3 py-3 border-y border-border">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form
          key={serializeLeadListHref({ q, sort, pipeline })}
          method="get"
          action="/leads"
          onSubmit={handleSubmit}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
        >
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <label className="sr-only" htmlFor="intake-list-search">
              Search leads
            </label>
            <input
              id="intake-list-search"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={200}
              placeholder="Search name, email, phone, title…"
              className="w-full min-w-[12rem] rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              autoComplete="off"
            />
          </div>
          
          <select
            name="pipeline"
            defaultValue={pipeline}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(e) => {
              const form = e.currentTarget.form;
              if (form) form.requestSubmit();
            }}
          >
            {pipelineOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            name="sort"
            defaultValue={sort}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onChange={(e) => {
              const form = e.currentTarget.form;
              if (form) form.requestSubmit();
            }}
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button type="submit" className="sr-only">
            Search
          </button>
          
          {hasActiveListFilters ? (
            <Link href="/leads" scroll={false} className="text-sm font-medium text-foreground-muted hover:text-foreground transition-colors">
              Clear
            </Link>
          ) : null}
        </form>
        
        <p
          className="shrink-0 text-sm font-medium text-foreground-muted"
          role="status"
          aria-live="polite"
        >
          {pipeline === "all" && !q && matchingCount === totalInOrg ? (
            <span>{totalInOrg} {totalInOrg === 1 ? "lead" : "leads"}</span>
          ) : (
            <span>
              <span className="text-foreground">{matchingCount}</span>
              {" "}
              {pipeline === "all" || q ? "matching" : pipelineOptions.find(p => p.value === pipeline)?.label.toLowerCase() ?? "matching"}
              <span className="text-foreground-subtle"> · {totalInOrg} total</span>
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
