"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  parseQuoteListSearchParams,
  QUOTE_LIST_DEFAULT_SORT,
  serializeQuotesListHref,
  type QuoteListSortParam,
  type QuoteListStatusParam,
} from "@/lib/quote-list-query";

export function QuoteListSearchForm({
  q,
  status,
  sort,
  matchingCount,
  totalInOrg,
  hasActiveListFilters,
  controlClass,
  primaryLinkClass,
  mutedLinkClass,
}: {
  q: string;
  status: QuoteListStatusParam;
  sort: QuoteListSortParam;
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
    const statusField = fd.get("status");
    const sortField = fd.get("sort");
    const { q: nextQ, status: nextStatus, sort: nextSort } =
      parseQuoteListSearchParams({
        q: String(fd.get("q") ?? ""),
        status: typeof statusField === "string" ? statusField : undefined,
        sort: typeof sortField === "string" ? sortField : undefined,
      });
    router.push(serializeQuotesListHref({ q: nextQ, status: nextStatus, sort: nextSort }), {
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
        Quotes{" "}
        <span className="text-foreground">{matchingCount}</span>
        <span className="text-foreground-subtle">/{totalInOrg}</span>
      </p>
      <form
        key={serializeQuotesListHref({ q, status, sort })}
        method="get"
        action="/quotes"
        onSubmit={handleSubmit}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
      >
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <label className="sr-only" htmlFor="quote-list-search">
            Search quotes
          </label>
          <input
            id="quote-list-search"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={200}
            placeholder="Search quotes…"
            className={controlClass}
            autoComplete="off"
          />
        </div>
        {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
        {sort !== QUOTE_LIST_DEFAULT_SORT ? (
          <input type="hidden" name="sort" value={sort} />
        ) : null}
        <button type="submit" className={primaryLinkClass}>
          Search
        </button>
        {hasActiveListFilters ? (
          <Link href="/quotes" scroll={false} className={mutedLinkClass}>
            Clear filters
          </Link>
        ) : null}
      </form>
    </div>
  );
}
