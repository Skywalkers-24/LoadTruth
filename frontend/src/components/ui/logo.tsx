/**
 * LoadTruth brand mark — the 🚛 truck emoji, rendered on a transparent surface
 * (no background fill) and sized to the `size` prop so it scales at every call
 * site (login, app-shell rail, assistant header). Emoji glyphs carry their own
 * color, so a `text-*` className only affects layout, not the glyph.
 */
export function LogoMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
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
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark size={28} className="shrink-0" />
      <span className="text-[15px] font-bold tracking-tight text-[var(--color-text)]">
        LoadTruth
      </span>
    </span>
  );
}
