import Link from "next/link";
import type { ReactNode } from "react";

const rowClass =
  "grid gap-3 border-t border-border py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6";

function SettingsRowTitle({
  title,
  description,
  status,
}: {
  title: string;
  description?: string;
  status?: ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 text-xs text-foreground-muted">{description}</p> : null}
      {status ? <div className="mt-2">{status}</div> : null}
    </div>
  );
}

export function SettingsRow({
  rowId,
  title,
  description,
  status,
  control,
  highlight = false,
}: {
  rowId: string;
  title: string;
  description?: string;
  status?: ReactNode;
  control: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      id={rowId}
      className={[
        rowClass,
        highlight ? "rounded-md bg-brand-muted/60 px-2 sm:px-3 transition-colors" : "",
      ]
        .join(" ")
        .trim()}
    >
      <SettingsRowTitle title={title} description={description} status={status} />
      <div className="justify-self-start sm:justify-self-end">{control}</div>
    </div>
  );
}

export function SettingsToggleRow({
  rowId,
  title,
  description,
  status,
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  highlight = false,
}: {
  rowId: string;
  title: string;
  description?: string;
  status?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
  highlight?: boolean;
}) {
  return (
    <SettingsRow
      rowId={rowId}
      title={title}
      description={description}
      status={status}
      highlight={highlight}
      control={
        <label className="relative inline-flex min-h-11 cursor-pointer items-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
            disabled={disabled}
            aria-label={ariaLabel}
            className="peer sr-only"
          />
          <span className="h-6 w-11 rounded-full bg-border transition-colors peer-checked:bg-accent peer-disabled:opacity-50" />
          <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-background transition-transform peer-checked:translate-x-5 peer-disabled:opacity-60" />
        </label>
      }
    />
  );
}

export function SettingsNumberRow({
  rowId,
  title,
  description,
  value,
  onChange,
  min,
  max,
  suffix,
  status,
  disabled = false,
  highlight = false,
}: {
  rowId: string;
  title: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  suffix?: string;
  status?: ReactNode;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <SettingsRow
      rowId={rowId}
      title={title}
      description={description}
      status={status}
      highlight={highlight}
      control={
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-foreground">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            disabled={disabled}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (!Number.isFinite(parsed)) return;
              onChange(parsed);
            }}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-right text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
          />
          {suffix ? <span className="text-xs text-foreground-muted">{suffix}</span> : null}
        </label>
      }
    />
  );
}

export function SettingsManageRow({
  rowId,
  title,
  description,
  href,
  highlight = false,
}: {
  rowId: string;
  title: string;
  description?: string;
  href: string;
  highlight?: boolean;
}) {
  return (
    <SettingsRow
      rowId={rowId}
      title={title}
      description={description}
      highlight={highlight}
      control={
        <Link
          href={href}
          className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Manage
        </Link>
      }
    />
  );
}
