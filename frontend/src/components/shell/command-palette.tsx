"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { openAuthedExport } from "@/lib/api";
import {
  ChartIcon,
  ClipboardIcon,
  DownloadIcon,
  GaugeIcon,
  PaletteIcon,
  SearchIcon,
  SettingsIcon,
  TruckIcon,
} from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { shortId } from "@/components/console/ticket-metadata";
import { useEventContext } from "@/lib/event-context";
import { debrisLabel, signedMoney, statusLabel } from "@/lib/format";
import { useTickets } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";

/** Event name used to ask the Review Console to open a specific ticket. */
export const OPEN_TICKET_EVENT = "lt:open-ticket";

interface PaletteApi {
  open: () => void;
}
const PaletteCtx = createContext<PaletteApi | null>(null);

export function usePalette(): PaletteApi {
  const ctx = useContext(PaletteCtx);
  if (!ctx) throw new Error("usePalette must be used within CommandPaletteProvider");
  return ctx;
}

interface Item {
  id: string;
  group: "Tickets" | "Navigate" | "Actions" | "Theme";
  label: string;
  hint?: string;
  right?: string;
  rightColor?: string;
  icon: React.ReactNode;
  run: () => void;
}

/**
 * Global command palette (Cmd/Ctrl + K). Jump to any page, open any ticket by
 * ID or truck number, export data, or switch theme, without leaving the keyboard.
 */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <PaletteCtx.Provider value={{ open }}>
      {children}
      {isOpen && <Palette onClose={() => setOpen(false)} />}
    </PaletteCtx.Provider>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { theme, mode, themes, setTheme, toggleMode } = useTheme();
  const { selectedId: eventId } = useEventContext();
  const tickets = useTickets({ eventId, limit: 100, offset: 0 });
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const items = useMemo<Item[]>(() => {
    const nav: Item[] = [
      {
        id: "nav-overview",
        group: "Navigate",
        label: "Overview",
        icon: <GaugeIcon size={15} />,
        run: () => go("/"),
      },
      {
        id: "nav-console",
        group: "Navigate",
        label: "Review",
        icon: <ClipboardIcon size={15} />,
        run: () => go("/console"),
      },
      {
        id: "nav-reports",
        group: "Navigate",
        label: "Reports",
        icon: <ChartIcon size={15} />,
        run: () => go("/reports"),
      },
      {
        id: "nav-admin",
        group: "Navigate",
        label: "Admin",
        icon: <SettingsIcon size={15} />,
        run: () => go("/admin"),
      },
    ];
    const themeActions: Item[] = [
      {
        id: "act-mode",
        group: "Theme" as const,
        label: `Switch to ${mode === "dark" ? "light" : "dark"} mode`,
        hint: `Currently ${mode}`,
        icon: <PaletteIcon size={15} />,
        run: () => {
          toggleMode();
          onClose();
        },
      },
      ...themes.map((t) => ({
        id: `act-theme-${t.id}`,
        group: "Theme" as const,
        label: `Theme: ${t.label}`,
        hint: t.description,
        icon: <PaletteIcon size={15} />,
        right: theme === t.id ? "Active" : undefined,
        rightColor: "var(--color-ok)",
        run: () => {
          setTheme(t.id);
          onClose();
        },
      })),
    ];
    const actions: Item[] = [
      ...(eventId
        ? [
            {
              id: "act-csv",
              group: "Actions" as const,
              label: "Export tickets as CSV",
              icon: <DownloadIcon size={15} />,
              run: () => {
                onClose();
                void openAuthedExport(`/events/${eventId}/export.csv`, {
                  download: `loadtruth-${eventId}.csv`,
                });
              },
            },
          ]
        : []),
    ];
    const ticketItems: Item[] = (tickets.data?.items ?? []).map((t) => ({
      id: `t-${t.id}`,
      group: "Tickets",
      label: `${shortId(t.id)}  ${t.truck_id ?? "Unidentified"}`,
      hint: `${debrisLabel(t.debris_class)} · ${statusLabel(t.status)}`,
      right: t.valuation.delta_dollar_value
        ? signedMoney(t.valuation.delta_dollar_value)
        : undefined,
      rightColor: t.valuation.is_overbill ? "var(--color-money)" : "var(--color-muted-foreground)",
      icon: <TruckIcon size={15} />,
      run: () => {
        onClose();
        router.push(`/console?ticket=${t.id}`);
        window.dispatchEvent(new CustomEvent(OPEN_TICKET_EVENT, { detail: t.id }));
      },
    }));

    const needle = q.trim().toLowerCase();
    const match = (i: Item) =>
      !needle || `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(needle);
    const filteredTickets = ticketItems.filter(match).slice(0, needle ? 8 : 5);
    return [
      ...nav.filter(match),
      ...filteredTickets,
      ...actions.filter(match),
      ...themeActions.filter(match),
    ];
  }, [tickets.data, q, theme, mode, themes, eventId, go, setTheme, toggleMode, onClose, router]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(items.length - 1, a + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        items[active]?.run();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, active, onClose]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const groups: Item["group"][] = ["Navigate", "Tickets", "Actions", "Theme"];

  return (
    <div
      className="lt-fade-in fixed inset-0 z-[60] flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="lt-pop-in w-full max-w-xl overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4">
          <SearchIcon size={16} className="shrink-0 text-[var(--color-subtle)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tickets, trucks, pages, or actions"
            className="h-12 w-full bg-transparent text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-subtle)] focus:outline-none"
            aria-label="Search"
          />
          <Kbd>Esc</Kbd>
        </div>

        <div ref={listRef} className="lt-scroll max-h-[380px] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-[var(--color-muted-foreground)]">
              No results for &ldquo;{q}&rdquo;.
            </p>
          ) : (
            groups.map((g) => {
              const inGroup = items.filter((i) => i.group === g);
              if (inGroup.length === 0) return null;
              return (
                <div key={g} className="mb-1">
                  <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
                    {g}
                  </div>
                  {inGroup.map((it) => {
                    const idx = items.indexOf(it);
                    const isActive = idx === active;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        data-idx={idx}
                        onMouseMove={() => setActive(idx)}
                        onClick={it.run}
                        className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left"
                        style={{
                          backgroundColor: isActive ? "var(--color-accent-soft)" : "transparent",
                        }}
                      >
                        <span
                          className={
                            isActive ? "text-[var(--color-accent)]" : "text-[var(--color-subtle)]"
                          }
                        >
                          {it.icon}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                          <span className="truncate text-[13px] font-medium tabular-nums text-[var(--color-text)]">
                            {it.label}
                          </span>
                          {it.hint && (
                            <span className="truncate text-[12px] text-[var(--color-muted-foreground)]">
                              {it.hint}
                            </span>
                          )}
                        </span>
                        {it.right && (
                          <span
                            className="shrink-0 text-[13px] font-semibold tabular-nums"
                            style={{ color: it.rightColor }}
                          >
                            {it.right}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-[12px] text-[var(--color-subtle)]">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to move
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> to open
          </span>
        </div>
      </div>
    </div>
  );
}
