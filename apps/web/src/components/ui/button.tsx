import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "muted";
export type ButtonSize = "sm" | "md";

const baseClass =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-accent text-accent-contrast shadow-sm hover:opacity-90",
  secondary:
    "border border-border bg-surface text-foreground hover:border-border-strong hover:bg-foreground/[0.02]",
  ghost:
    "border border-transparent text-foreground-muted hover:bg-foreground/[0.04] hover:text-foreground",
  muted:
    "border border-border bg-foreground/[0.02] text-foreground-muted hover:border-border-strong hover:bg-foreground/[0.04] hover:text-foreground",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-xs",
  md: "px-3 py-2 text-sm",
};

export function buttonClassName({
  variant = "secondary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return [baseClass, variantClass[variant], sizeClass[size], className]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...props}
    >
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClassName({ variant, size, className })}
      {...props}
    >
      {children}
    </Link>
  );
}

/** @deprecated Prefer ButtonLink with variant="primary" */
export const primaryLinkClass = buttonClassName({ variant: "primary", size: "sm" });

/** @deprecated Prefer ButtonLink with variant="muted" */
export const mutedLinkClass = buttonClassName({ variant: "muted", size: "sm" });
