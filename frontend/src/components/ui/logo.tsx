/**
 * LoadTruth brand mark — the 🚛 truck emoji, rendered on a transparent surface
 * (no background fill) and sized to the `size` prop so it scales at every call
 * site (login, app-shell rail, assistant header). Emoji glyphs carry their own
 * color, so a `text-*` className only affects layout, not the glyph.
 *
 * Pass `animated` to wrap the mark in a moving-border ring: a conic gradient
 * rotates behind a masked transparent centre (see `.lt-logo-ring` in
 * globals.css), so a thin band of light appears to trace the border. The ring
 * honors `prefers-reduced-motion` via the global reduced-motion rule.
 */
export function LogoMark({
  size = 28,
  className,
  animated = false,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  const glyph = (
    <span
      role="img"
      aria-label="LoadTruth"
      className={animated ? undefined : className}
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

  if (!animated) return glyph;

  return (
    <span
      className={`lt-logo-ring ${className ?? ""}`}
      style={{ width: size + 14, height: size + 14 }}
    >
      {glyph}
    </span>
  );
}

/** Horizontal lockup: mark + wordmark. */
export function LogoLockup({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark size={28} animated className="shrink-0" />
      <span className="text-[15px] font-bold tracking-tight text-[var(--color-text)]">
        LoadTruth
      </span>
    </span>
  );
}
