"use client";

import { useRef, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

/** Defer theme UI until after hydration without `useEffect` + `setState` (avoids cascading-render lint). */
function useHasMounted() {
  const mountedRef = useRef(false);
  return useSyncExternalStore(
    (onStoreChange) => {
      queueMicrotask(() => {
        mountedRef.current = true;
        onStoreChange();
      });
      return () => {};
    },
    () => mountedRef.current,
    () => false
  );
}

const modes = [
  { id: "light" as const, label: "Light", icon: Sun },
  { id: "dark" as const, label: "Dark", icon: Moon },
  { id: "system" as const, label: "System", icon: Monitor },
];

export function AppearanceControl() {
  const { theme, setTheme } = useTheme();
  const mounted = useHasMounted();

  if (!mounted) {
    return (
      <div
        className="h-9 w-[min(100%,11.5rem)] shrink-0 rounded-lg border border-border bg-surface"
        aria-hidden
      />
    );
  }

  return (
    <fieldset className="flex w-full shrink-0 items-center justify-between gap-0.5 rounded-lg border border-border bg-surface p-0.5 shadow-sm">
      <legend className="sr-only">Appearance</legend>
      {modes.map(({ id, label, icon: Icon }) => {
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            title={label}
            aria-pressed={active}
            className={[
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-foreground/5 text-foreground"
                : "text-foreground-muted hover:bg-foreground/[0.04] hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="size-3.5 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
            <span className="sr-only">{label}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
