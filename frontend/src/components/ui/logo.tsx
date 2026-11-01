import { cn } from "@/lib/utils";

export interface LogoMarkProps {
  /** Pixel dimension (width & height). Defaults to 28. */
  size?: number;
  /** Additional CSS class names. */
  className?: string;
  /** Whether to render the badge (with squircle background & border) or transparent mark only. */
  badge?: boolean;
  /** Explicit variant name. Overrides badge when provided. */
  variant?: "badge" | "transparent";
  /** Force dark or light theme regardless of the active app mode. */
  forceTheme?: "dark" | "light";
}

/**
 * LoadTruth official brand mark.
 * Renders the vector identity (stylized dump truck, raised load bed, verified checkmark)
 * in theme-aware light/dark SVG with optional squircle badge.
 */
export function LogoMark({
  size = 36,
  className,
  badge = true,
  variant,
  forceTheme,
}: LogoMarkProps) {
  const isBadge = variant ? variant === "badge" : badge;
  const darkSrc = isBadge
    ? "/icons/dark/svg/loadtruth-dark-1024.svg"
    : "/icons/transparent/dark/svg/loadtruth-dark-transparent-1024.svg";
  const lightSrc = isBadge
    ? "/icons/light/svg/loadtruth-light-1024.svg"
    : "/icons/transparent/light/svg/loadtruth-light-transparent-1024.svg";

  if (forceTheme === "dark") {
    return (
      <img
        src={darkSrc}
        alt="LoadTruth"
        width={size}
        height={size}
        className={cn("inline-block shrink-0 select-none object-contain", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  if (forceTheme === "light") {
    return (
      <img
        src={lightSrc}
        alt="LoadTruth"
        width={size}
        height={size}
        className={cn("inline-block shrink-0 select-none object-contain", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={cn("inline-flex items-center justify-center shrink-0 select-none", className)}
      style={{ width: size, height: size }}
    >
      <img
        src={lightSrc}
        alt="LoadTruth"
        width={size}
        height={size}
        className="block dark:hidden object-contain w-full h-full"
      />
      <img
        src={darkSrc}
        alt="LoadTruth"
        width={size}
        height={size}
        className="hidden dark:block object-contain w-full h-full"
      />
    </span>
  );
}

/** Horizontal lockup: mark + wordmark. */
export function LogoLockup({
  className,
  size = 36,
  badge = true,
  variant,
  forceTheme,
}: {
  className?: string;
  size?: number;
  badge?: boolean;
  variant?: "badge" | "transparent";
  forceTheme?: "dark" | "light";
}) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark size={size} badge={badge} variant={variant} forceTheme={forceTheme} className="shrink-0" />
      <span className="text-[17px] font-bold tracking-tight text-[var(--color-text)]">
        LoadTruth
      </span>
    </span>
  );
}
