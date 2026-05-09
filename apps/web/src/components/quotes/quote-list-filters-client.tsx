"use client";

import Link from "next/link";

export type QuoteListFilterNavItem = {
  key: string;
  href: string;
  label: string;
  active: boolean;
};

export function QuoteListFiltersClient({
  statusItems,
  sortItems,
  pillActiveClass,
  pillIdleClass,
  sortActiveClass,
  sortIdleClass,
}: {
  statusItems: QuoteListFilterNavItem[];
  sortItems: QuoteListFilterNavItem[];
  pillActiveClass: string;
  pillIdleClass: string;
  sortActiveClass: string;
  sortIdleClass: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <nav aria-label="Quote status filters" className="flex flex-wrap gap-2">
        {statusItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            scroll={false}
            className={item.active ? pillActiveClass : pillIdleClass}
            aria-current={item.active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <nav aria-label="Quote sort options" className="flex flex-wrap gap-1.5">
        {sortItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            scroll={false}
            className={item.active ? sortActiveClass : sortIdleClass}
            aria-current={item.active ? "true" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
