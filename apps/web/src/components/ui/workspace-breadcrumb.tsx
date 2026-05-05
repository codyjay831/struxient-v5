import Link from "next/link";

export type WorkspaceBreadcrumbItem = {
  label: string;
  /** Parent wayfinding only—omit for IA labels without a list route. */
  href?: string;
};

/**
 * Read-only wayfinding for deep workspace routes (not the main sidebar).
 * Typography aligned with sidebar section labels / page eyebrows.
 */
export function WorkspaceBreadcrumb({ items }: { items: WorkspaceBreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-baseline gap-x-0 gap-y-1 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-foreground-subtle">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex max-w-full min-w-0 items-baseline">
              {index > 0 ? (
                <span className="shrink-0 px-1.5 text-foreground-subtle" aria-hidden>
                  ›
                </span>
              ) : null}
              {item.href ? (
                <Link
                  href={item.href}
                  className="shrink-0 text-foreground-subtle transition-colors hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={[
                    "min-w-0",
                    isLast
                      ? /^Quote\s|^Lead\s|^Job\s|^Customer\s/.test(item.label)
                        ? "max-w-full break-all font-mono text-xs font-medium tracking-normal text-foreground-muted"
                        : "text-foreground-muted"
                      : "shrink-0 text-foreground-subtle",
                  ].join(" ")}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
