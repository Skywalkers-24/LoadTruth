/**
 * LoadTruth brand mark — the truck/check lockup, authored inline. The truck
 * outline uses `currentColor` so it adapts to the surrounding text color in
 * both themes; the load-bar and verification check keep Safety Amber.
 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      className={className}
      role="img"
      aria-label="LoadTruth"
    >
      <path
        d="M7 17 H43 L53 29 V43 H7 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M12 22 H39 L46 30 H12 Z" fill="var(--color-accent)" opacity="0.95" />
      <path d="M10 48 H49" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M17 49 a5 5 0 1 0 10 0 M38 49 a5 5 0 1 0 10 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M35 8 l6 6 12 -12"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Horizontal lockup: mark + wordmark. */
export function LogoLockup({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={26} className="shrink-0 text-[var(--color-text)]" />
      <span className="text-[15px] font-bold tracking-tight text-[var(--color-text)]">
        LoadTruth
      </span>
    </span>
  );
}
