"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { CheckIcon, MoonIcon, PaletteIcon, SunIcon } from "@/components/ui/icons";
import { type Theme, type ThemeMeta, type ThemeMode, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Three stacked color dots previewing a theme (bg · surface · accent). */
function Swatch({ colors }: { colors: [string, string, string] }) {
  return (
    <span className="flex shrink-0 items-center -space-x-1.5" aria-hidden>
      {colors.map((c, i) => (
        <span
          key={i}
          className="size-4 rounded-full ring-1 ring-black/20 dark:ring-white/15"
          style={{ background: c, zIndex: colors.length - i }}
        />
      ))}
    </span>
  );
}

function ThemeRow({
  meta,
  mode,
  active,
  onSelect,
}: {
  meta: ThemeMeta;
  mode: ThemeMode;
  active: boolean;
  onSelect: () => void;
}) {
  const colors = mode === "light" ? meta.swatchesLight : meta.swatches;
  return (
    <DropdownMenuItem
      // Radix manages menu focus/keyboard; the real menu item is what makes
      // selection fire. closeOnSelect is kept so users can preview without the
      // menu snapping shut between picks.
      onSelect={(e) => {
        e.preventDefault();
        onSelect();
      }}
      aria-checked={active}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2",
        active && "bg-accent/60",
      )}
    >
      <Swatch colors={colors} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">{meta.label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{meta.description}</span>
      </span>
      <span className="flex size-4 shrink-0 items-center justify-center text-[var(--color-brand)]">
        {active ? <CheckIcon size={15} /> : null}
      </span>
    </DropdownMenuItem>
  );
}

/**
 * Theme control: a dropdown with a dark/light mode toggle plus the six theme
 * identities, each previewed with live color swatches for the current mode.
 * Theme identity and mode are independent axes (see lib/theme.tsx).
 */
export function ThemeToggle() {
  const { theme, mode, themes, setTheme, setMode } = useTheme();
  const choose = (id: Theme) => setTheme(id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Change theme"
          title="Change theme"
          className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] data-[state=open]:border-[var(--color-brand)] data-[state=open]:text-[var(--color-text)] sm:size-8"
        >
          <PaletteIcon size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-1.5">
        {/* Mode toggle */}
        <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Mode
        </DropdownMenuLabel>
        <div className="mb-1 flex gap-1 px-1.5">
          <ModeButton
            label="Dark"
            icon={<MoonIcon size={14} />}
            active={mode === "dark"}
            onClick={() => setMode("dark")}
          />
          <ModeButton
            label="Light"
            icon={<SunIcon size={14} />}
            active={mode === "light"}
            onClick={() => setMode("light")}
          />
        </div>

        <DropdownMenuSeparator />

        {/* Theme identities */}
        <DropdownMenuLabel className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <PaletteIcon size={13} /> Theme
        </DropdownMenuLabel>
        {themes.map((meta) => (
          <ThemeRow
            key={meta.id}
            meta={meta}
            mode={mode}
            active={theme === meta.id}
            onSelect={() => choose(meta.id)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModeButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px] font-medium transition-colors",
        active
          ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] text-[var(--color-text)]"
          : "border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Alias for clarity at call sites that want the richer name. */
export const ThemePicker = ThemeToggle;
