"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { CheckIcon, PaletteIcon } from "@/components/ui/icons";
import { type Theme, type ThemeMeta, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Three stacked color dots previewing a theme (bg · surface · accent). */
function Swatch({ colors }: { colors: ThemeMeta["swatches"] }) {
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
  active,
  onSelect,
}: {
  meta: ThemeMeta;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      // Radix manages menu focus/keyboard + closes the menu on select; using the
      // real menu item (not a raw <button>) is what makes selection actually fire.
      onSelect={onSelect}
      aria-checked={active}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2",
        active && "bg-accent/60",
      )}
    >
      <Swatch colors={meta.swatches} />
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
 * Theme picker. Replaces the old binary dark/light toggle with a dropdown of
 * all curated themes, grouped by base scheme, each with a live color preview.
 * The trigger icon reflects the active scheme (sun for light, moon for dark).
 */
export function ThemeToggle() {
  const { theme, themes, setTheme } = useTheme();
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
        <DropdownMenuLabel className="flex items-center gap-2 px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <PaletteIcon size={13} /> Theme
        </DropdownMenuLabel>
        {themes.map((meta) => (
          <ThemeRow
            key={meta.id}
            meta={meta}
            active={theme === meta.id}
            onSelect={() => choose(meta.id)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Alias for clarity at call sites that want the richer name. */
export const ThemePicker = ThemeToggle;
