"use client";

import Link from "next/link";

export type LeadListFilterNavItem = {
  key: string;
  href: string;
  label: string;
  active: boolean;
};

export function LeadListFiltersClient({
  sortItems,
  sortActiveClass,
  sortIdleClass,
}: {
  sortItems: LeadListFilterNavItem[];
  sortActiveClass: string;
  sortIdleClass: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <nav aria-label="Intake sort options" className="flex flex-wrap gap-1.5">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle py-1 px-1">Sort:</span>
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
