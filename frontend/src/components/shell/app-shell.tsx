"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { EventSwitcher } from "@/components/shell/event-switcher";
import { HealthIndicator } from "@/components/shell/health-indicator";
import { Notifications } from "@/components/shell/notifications";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ChartIcon,
  ClipboardIcon,
  GaugeIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  XIcon,
} from "@/components/ui/icons";
import { LogoLockup, LogoMark } from "@/components/ui/logo";
import { useEventContext } from "@/lib/event-context";

const NAV = [
  { href: "/", label: "Overview", icon: GaugeIcon },
  { href: "/console", label: "Review Console", icon: ClipboardIcon },
  { href: "/reports", label: "Reports", icon: ChartIcon },
  { href: "/admin", label: "Admin", icon: SettingsIcon },
];

/**
 * The authenticated application shell: a fixed left navigation rail, a top bar
 * with breadcrumb / event context / health / theme, and the routed content.
 * Collapses to a slide-over drawer + compact top bar below the lg breakpoint.
 */
export function AppShell({
  children,
  section,
}: {
  children: ReactNode;
  section: string;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  // Close the mobile drawer on route change.
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      {/* ── Desktop rail ─────────────────────────────────────────────── */}
      <aside className="lt-rail-shadow sticky top-0 z-20 hidden h-dvh flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
        <RailContent pathname={pathname} />
      </aside>

      {/* ── Mobile drawer ────────────────────────────────────────────── */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Navigation">
          <div
            className="absolute inset-0 bg-black/55"
            onClick={() => setDrawer(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 flex h-full w-[260px] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="flex items-center justify-between px-3 pt-3">
              <LogoLockup />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close navigation"
                className="rounded-md p-1 text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                <XIcon size={18} />
              </button>
            </div>
            <RailContent pathname={pathname} hideBrand />
          </aside>
        </div>
      )}

      {/* ── Main column ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-col">
        <TopBar section={section} onMenu={() => setDrawer(true)} />
        <main className="lt-scroll lt-fade-in min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-7">
          {children}
        </main>
      </div>
    </div>
  );
}

function RailContent({ pathname, hideBrand = false }: { pathname: string; hideBrand?: boolean }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!hideBrand && (
        <div className="px-3 pb-3 pt-4">
          <Link href="/" className="inline-flex" aria-label="LoadTruth home">
            <LogoLockup />
          </Link>
        </div>
      )}

      <div className="px-3 pb-2">
        <EventSwitcher />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Primary">
        <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-[var(--color-subtle)]">
          Core workflow
        </div>
        <ul className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center gap-2.5 rounded-lg border border-l-2 px-2.5 py-2 text-[13px] font-medium transition-colors"
                  style={{
                    borderColor: active ? "var(--color-border)" : "transparent",
                    borderLeftColor: active ? "var(--color-accent)" : "transparent",
                    color: active ? "var(--color-text)" : "var(--color-muted)",
                    backgroundColor: active ? "var(--color-surface-2)" : "transparent",
                  }}
                >
                  <Icon
                    size={17}
                    className={active ? "text-[var(--color-accent)]" : "text-[var(--color-subtle)]"}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Signed-in user / role / sign-out. Single seeded tenant in this build. */}
      <div className="border-t border-[var(--color-border)] p-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-2">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full"
            style={{ backgroundColor: "var(--color-accent-fill)", color: "var(--color-on-accent)" }}
            aria-hidden
          >
            <LogoMark size={15} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[12px] font-semibold text-[var(--color-text)]">
              Operator
            </span>
            <span className="truncate text-[10px] font-bold uppercase tracking-wide text-[var(--color-subtle)]">
              supervisor
            </span>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            className="rounded-md p-1.5 text-[var(--color-subtle)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
          >
            <LogOutIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function TopBar({ section, onMenu }: { section: string; onMenu: () => void }) {
  const { selected } = useEventContext();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_88%,transparent)] px-4 py-2.5 backdrop-blur sm:px-6 lg:px-7">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open navigation"
        className="rounded-md p-1.5 text-[var(--color-muted)] hover:text-[var(--color-text)] lg:hidden"
      >
        <MenuIcon size={20} />
      </button>

      {/* Breadcrumb: section + active event. */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
        <span className="hidden text-[var(--color-subtle)] sm:inline">LoadTruth</span>
        <span className="hidden text-[var(--color-subtle)] sm:inline" aria-hidden>
          /
        </span>
        <span className="font-semibold text-[var(--color-text)]">{section}</span>
        {selected && (
          <>
            <span className="text-[var(--color-subtle)]" aria-hidden>
              ·
            </span>
            <span className="truncate text-[var(--color-muted)]">{selected.name}</span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden sm:block">
          <HealthIndicator />
        </div>
        <Notifications />
        <ThemeToggle />
      </div>
    </header>
  );
}
