import type { PlatformPageQuery, PlatformPageResult } from "./platform-types";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 50;
export const MIN_SEARCH_LENGTH = 2;

export function normalizePageQuery(query: PlatformPageQuery): {
  page: number;
  pageSize: number;
  q: string | null;
} {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const trimmed = query.q?.trim() ?? "";
  const q = trimmed.length >= MIN_SEARCH_LENGTH ? trimmed : null;
  return { page, pageSize, q };
}

export function toPageResult<T>(
  items: T[],
  totalCount: number,
  page: number,
  pageSize: number,
): PlatformPageResult<T> {
  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export function shortId(id: string): string {
  return id.slice(-8);
}
