"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  parseLeadListSearchParams,
  LEAD_LIST_DEFAULT_SORT,
  serializeLeadListHref,
  type LeadListSortParam,
} from "@/lib/lead-list-query";

export function LeadListSearchForm({
  q,
  sort,
  matchingCount,
  totalInOrg,
  hasActiveListFilters,
  controlClass,
  primaryLinkClass,
  mutedLinkClass,
}: {
  q: string;
  sort: LeadListSortParam;
  matchingCount: number;
  totalInOrg: number;
  hasActiveListFilters: boolean;
  controlClass: string;
  primaryLinkClass: string;
  mutedLinkClass: string;
}) {
  const router = useRouter();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sortField = fd.get("sort");
    const { q: nextQ, sort: nextSort } =
      parseLeadListSearchParams({
        q: String(fd.get("q") ?? ""),
        sort: typeof sortField === "string" ? sortField : undefined,
      });
    router.push(serializeLeadListHref({ q: nextQ, sort: nextSort }), {
      scroll: false,
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <p
        className="shrink-0 text-sm font-medium tabular-nums text-foreground-muted"
        role="status"
        aria-live="polite"
      >
        Opportunities{" "}
        <span className="text-foreground">{matchingCount}</span>
        <span className="text-foreground-subtle">/{totalInOrg}</span>
      </p>
      <form
        key={serializeLeadListHref({ q, sort })}
        method="get"
        action="/leads"
        onSubmit={handleSubmit}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
      >
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label className="sr-only" htmlFor="intake-list-search">
            Search opportunities
          </label>
          <input
            id="intake-list-search"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={200}
            placeholder="Search name, email, phone…"
            className={controlClass}
            autoComplete="off"
          />
        </div>
        {sort !== LEAD_LIST_DEFAULT_SORT ? (
          <input type="hidden" name="sort" value={sort} />
        ) : null}
        <button type="submit" className={primaryLinkClass}>
          Search
        </button>
        {hasActiveListFilters ? (
          <Link href="/leads" scroll={false} className={mutedLinkClass}>
            Clear filters
          </Link>
        ) : null}
      </form>
    </div>
  );
}
