/**
 * LoadTruth brand mark — the 🚛 truck emoji lockup. Rendered as text sized to
 * the `size` prop so it scales with every call site (login, app-shell rail,
 * assistant header). Emoji glyphs carry their own color, so a `text-*`
 * className only affects spacing/layout, not the glyph itself.
 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="LoadTruth"
      className={className}
      style={{
        fontSize: size,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      🚛
    </span>
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
