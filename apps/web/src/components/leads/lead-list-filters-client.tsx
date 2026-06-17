"use client";

import Link from "next/link";

export type LeadListFilterNavItem = {
  key: string;
  href: string;
  label: string;
  active: boolean;
};

export function LeadListFiltersClient({
  pipelineItems,
  pipelineActiveClass,
  pipelineIdleClass,
  sortItems,
  sortActiveClass,
  sortIdleClass,
  viewItems,
  viewActiveClass,
  viewIdleClass,
}: {
  pipelineItems: LeadListFilterNavItem[];
  pipelineActiveClass: string;
  pipelineIdleClass: string;
  sortItems: LeadListFilterNavItem[];
  sortActiveClass: string;
  sortIdleClass: string;
  viewItems: LeadListFilterNavItem[];
  viewActiveClass: string;
  viewIdleClass: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <nav aria-label="View mode" className="flex flex-wrap gap-1.5">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle py-1 px-1">
          View:
        </span>
        {viewItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            scroll={false}
            className={item.active ? viewActiveClass : viewIdleClass}
            aria-current={item.active ? "true" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Pipeline categories" className="flex flex-wrap gap-1.5">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle py-1 px-1">Pipeline:</span>
        {pipelineItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            scroll={false}
            className={item.active ? pipelineActiveClass : pipelineIdleClass}
            aria-current={item.active ? "true" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
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
