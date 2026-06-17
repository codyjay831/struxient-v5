"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

// React 19 / Next 15+ workaround for next-themes script tag warning
// https://github.com/pacocoursey/next-themes/issues/387
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag while rendering React component")
    ) {
      return;
    }
    orig.apply(console, args);
  };
}

export function ThemeProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="struxient-v5-theme"
      disableTransitionOnChange
    >
      {children}
      <Toaster
        theme="system"
        position="bottom-right"
        closeButton
        toastOptions={{
          classNames: {
            toast: "border border-border bg-surface text-foreground shadow-lg",
            title: "font-medium",
            description: "text-foreground-muted",
          },
        }}
      />
    </ThemeProvider>
  );
}
