import type { ReactNode } from "react";
export function SettingsPageShell({
  searchSlot,
  mobileCategorySlot,
  desktopCategorySlot,
  children,
}: {
  searchSlot: ReactNode;
  mobileCategorySlot: ReactNode;
  desktopCategorySlot: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:items-start">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        </div>
        {searchSlot}
      </div>

      <div className="mb-4">{mobileCategorySlot}</div>

      <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">{desktopCategorySlot}</aside>
        <section>{children}</section>
      </div>
    </div>
  );
}
