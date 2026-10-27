"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { usePalette } from "@/components/shell/command-palette";
import { EventSwitcher } from "@/components/shell/event-switcher";
import { HealthIndicator } from "@/components/shell/health-indicator";
import { Notifications } from "@/components/shell/notifications";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ChartIcon,
  ClipboardIcon,
  GaugeIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { LogoLockup } from "@/components/ui/logo";
import { useEventContext } from "@/lib/event-context";
import { useReportsSummary } from "@/lib/hooks";

const NAV = [
  { href: "/", label: "Overview", short: "Overview", icon: GaugeIcon },
  { href: "/console", label: "Review Console", short: "Review", icon: ClipboardIcon, badge: true },
  { href: "/reports", label: "Reports", short: "Reports", icon: ChartIcon },
  { href: "/admin", label: "Admin", short: "Admin", icon: SettingsIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Count of draft tickets awaiting review for the active event. */
function usePendingCount(): number {
  const { selectedId } = useEventContext();
  const { data } = useReportsSummary(selectedId);
  return data?.counts_by_status?.draft ?? 0;
}

/**
 * Application shell. Desktop: fixed left rail + sticky top bar. Mobile: compact
 * top bar, slide-over drawer for event context, and a bottom tab bar so the
 * primary destinations are always one thumb tap away.
 */
export function AppShell({ children, section }: { children: ReactNode; section: string }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="lt-rail-shadow sticky top-0 z-20 hidden h-dvh flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
        <RailContent pathname={pathname} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Navigation">
          <div className="lt-fade-in absolute inset-0 bg-black/55" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="lt-pop-in absolute left-0 top-0 flex h-full w-[280px] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between px-4 pt-4">
              <LogoLockup />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close navigation"
                className="inline-flex size-9 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              >
                <XIcon size={18} />
              </button>
            </div>
            <RailContent pathname={pathname} hideBrand />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <TopBar section={section} onMenu={() => setDrawer(true)} />
        <main className="lt-fade-in min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>

      <BottomTabs pathname={pathname} />
    </div>
  );
}

function RailContent({ pathname, hideBrand = false }: { pathname: string; hideBrand?: boolean }) {
  const pending = usePendingCount();
  const palette = usePalette();

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!hideBrand && (
        <div className="px-4 pb-4 pt-5">
          <Link href="/" className="inline-flex rounded-md" aria-label="LoadTruth home">
            <LogoLockup />
          </Link>
        </div>
      )}

      <div className="px-3 pb-3 pt-3 lg:pt-0">
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
          Event
        </div>
        <EventSwitcher />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-3" aria-label="Primary">
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
          Workspace
        </div>
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{
                    color: active ? "var(--color-text)" : "var(--color-muted)",
                    backgroundColor: active ? "var(--color-accent-soft)" : undefined,
                  }}
                >
                  {active && (
                    <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[var(--color-accent)]" aria-hidden />
                  )}
                  <Icon
                    size={17}
                    className={active ? "text-[var(--color-accent)]" : "text-[var(--color-subtle)] group-hover:text-[var(--color-muted)]"}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && pending > 0 && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                      style={{ backgroundColor: "var(--color-accent-fill)", color: "var(--color-on-accent)" }}
                      aria-label={`${pending} awaiting review`}
                    >
                      {pending}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-2 border-t border-[var(--color-border)] p-3">
        <button
          type="button"
          onClick={palette.open}
          className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-[12px] text-[var(--color-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
        >
          <span className="flex items-center gap-2">
            <SearchIcon size={14} /> Quick search
          </span>
          <Kbd>⌘K</Kbd>
        </button>
        <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-bold"
            style={{ backgroundColor: "var(--color-accent-fill)", color: "var(--color-on-accent)" }}
            aria-hidden
          >
            OP
          </span>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[13px] font-semibold text-[var(--color-text)]">Operator</span>
            <span className="truncate text-[12px] text-[var(--color-subtle)]">Supervisor</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopBar({ section, onMenu }: { section: string; onMenu: () => void }) {
  const { selected } = useEventContext();
  const palette = usePalette();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_85%,transparent)] px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open navigation"
        className="inline-flex size-9 items-center justify-center rounded-md text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] lg:hidden"
      >
        <MenuIcon size={20} />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
        <span className="font-semibold text-[var(--color-text)]">{section}</span>
        {selected && (
          <>
            <span className="hidden text-[var(--color-border-strong)] sm:inline" aria-hidden>
              /
            </span>
            <span className="hidden truncate text-[var(--color-muted)] sm:inline" title={selected.name}>
              {selected.name}
            </span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={palette.open}
          className="hidden h-9 w-64 items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[13px] text-[var(--color-subtle)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-muted)] md:flex"
        >
          <span className="flex items-center gap-2">
            <SearchIcon size={14} /> Search tickets and trucks
          </span>
          <Kbd>⌘K</Kbd>
        </button>
        <button
          type="button"
          onClick={palette.open}
          aria-label="Search"
          className="inline-flex size-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] md:hidden"
        >
          <SearchIcon size={16} />
        </button>
        <div className="hidden sm:block">
          <HealthIndicator />
        </div>
        <Notifications />
        <ThemeToggle />
      </div>
    </header>
  );
}

function BottomTabs({ pathname }: { pathname: string }) {
  const pending = usePendingCount();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium"
            style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
          >
            <span className="relative">
              <Icon size={20} />
              {item.badge && pending > 0 && (
                <span
                  className="absolute -right-2.5 -top-1.5 rounded-full px-1 text-[10px] font-bold tabular-nums"
                  style={{ backgroundColor: "var(--color-accent-fill)", color: "var(--color-on-accent)" }}
                >
                  {pending}
                </span>
              )}
            </span>
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
