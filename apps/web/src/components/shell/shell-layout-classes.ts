/** Shared responsive spacing for signed-in app shells. */
export const shellHeaderClass =
  "flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-4 sm:gap-4 sm:px-6 lg:px-8";

export const shellMainClass = "flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10";

export const shellSidebarClass =
  "sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-border bg-sidebar px-4 py-6 lg:flex";

/** Canonical page width wrappers to avoid hardcoded max-w values across routes. */
export const workspaceContentWidth = {
  default: "mx-auto w-full max-w-5xl",
  wide: "mx-auto w-full max-w-[1600px]",
  narrow: "mx-auto w-full max-w-3xl",
};
