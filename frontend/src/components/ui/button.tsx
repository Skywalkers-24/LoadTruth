import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "ok" | "warn" | "danger";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";

const SIZE: Record<Size, string> = {
  sm: "px-2.5 py-1 text-[12px]",
  md: "px-3.5 py-2 text-[13px]",
};

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent-fill)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent)]",
  secondary:
    "border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:border-[var(--color-accent)]",
  ghost: "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
  ok: "border border-[var(--color-ok)] text-[var(--color-ok)] hover:bg-[var(--color-ok-soft)]",
  warn: "border border-[var(--color-warn)] text-[var(--color-warn)] hover:bg-[var(--color-warn-soft)]",
  danger:
    "border border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={`${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className ?? ""}`} {...props}>
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

/** Anchor styled as a secondary button (for download/export links). */
export function LinkButton({
  href,
  children,
  icon,
  size = "md",
  external = false,
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  size?: Size;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`${BASE} ${SIZE[size]} ${VARIANT.secondary}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </a>
  );
}
