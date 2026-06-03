import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Disabled control — signals a future action without dev-facing labels. */
export function PlaceholderButton({
  children,
  title = "Coming in a future update",
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <Button variant="muted" size="sm" disabled title={title} className="cursor-not-allowed opacity-60">
      {children}
    </Button>
  );
}
