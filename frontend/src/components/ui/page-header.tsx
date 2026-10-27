import type { ReactNode } from "react";

/** Consistent page title block: eyebrow, title, description, and actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
            {eyebrow}
          </span>
        )}
        <h1 className="line-clamp-2 text-[22px] font-semibold tracking-tight text-[var(--color-text)] sm:truncate">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-[13px] text-[var(--color-muted)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
