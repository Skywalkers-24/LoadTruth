import type { ReactNode } from "react";

import { AlertIcon, InfoIcon } from "@/components/ui/icons";

/** A flat, bordered surface panel. The console's base building block. */
export function Panel({
  children,
  className,
  as: Tag = "section",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside";
  pad?: boolean;
}) {
  return (
    <Tag
      className={`lt-card-shadow rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] ${
        pad ? "p-4" : ""
      } ${className ?? ""}`}
    >
      {children}
    </Tag>
  );
}

/** Section header with an optional leading icon and trailing actions. */
export function SectionTitle({
  children,
  icon,
  actions,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className ?? ""}`}>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-text)]">
        {icon && <span className="text-[var(--color-subtle)]">{icon}</span>}
        {children}
      </h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A thin technical divider. */
export function Divider({ className }: { className?: string }) {
  return <div className={`h-px w-full bg-[var(--color-border)] ${className ?? ""}`} aria-hidden />;
}

/** Key/value row for compact metadata panels. */
export function MetaItem({
  label,
  value,
  mono = true,
  hint,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
        {label}
      </dt>
      <dd
        className={`text-[13px] font-medium text-[var(--color-text)] ${mono ? "tabular-nums" : ""}`}
        title={hint}
      >
        {value}
      </dd>
    </div>
  );
}

/** Honest empty state — never fabricates data. */
export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface-2)_60%,transparent)] px-6 py-10 text-center">
      <span className="mb-1 grid size-11 place-items-center rounded-full bg-[var(--color-surface-3)] text-[var(--color-muted-foreground)]">
        {icon ?? <InfoIcon size={20} />}
      </span>
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      {description && (
        <p className="max-w-sm text-[13px] text-[var(--color-muted-foreground)]">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Error state with an optional retry. */
export function ErrorState({
  title = "Couldn’t load this data",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-6 py-10 text-center">
      <span className="text-[var(--color-danger)]">
        <AlertIcon size={22} />
      </span>
      <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
      {description && (
        <p className="max-w-sm text-[13px] text-[var(--color-muted-foreground)]">{description}</p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-text)] hover:border-[var(--color-accent)]"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/** Loading skeleton block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`lt-shimmer rounded-md ${className ?? ""}`} aria-hidden />
  );
}

/** A labelled, data-unavailable placeholder — honest about missing backend data. */
export function Unavailable({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[var(--color-subtle)]" title={label}>
      {label ?? "Not available"}
    </span>
  );
}
