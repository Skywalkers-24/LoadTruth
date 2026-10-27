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
import { BookOpenIcon, LogOutIcon, PlusIcon } from "lucide-react";

import type { Capabilities } from "@/lib/api";
import { Kbd } from "@/components/ui/kbd";
import { LogoMark } from "@/components/ui/logo";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useReportsSummary } from "@/lib/hooks";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: boolean;
  /** Only shown when the signed-in member has this capability. */
  cap?: keyof Capabilities;
};

const NAV: NavItem[] = [
  { href: "/", label: "Overview", short: "Overview", icon: GaugeIcon },
  { href: "/console", label: "Review Console", short: "Review", icon: ClipboardIcon, badge: true },
  { href: "/add", label: "Add a Ticket", short: "Add", icon: PlusIcon, cap: "ingest" },
  { href: "/reports", label: "Reports", short: "Reports", icon: ChartIcon },
  { href: "/guide", label: "Guide", short: "Guide", icon: BookOpenIcon },
  { href: "/admin", label: "Admin", short: "Admin", icon: SettingsIcon, cap: "manage_events" },
];

/** The nav items visible to the given capabilities (undefined cap = always). */
function visibleNav(can: (c: keyof Capabilities) => boolean): NavItem[] {
  return NAV.filter((item) => !item.cap || can(item.cap));
}

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
    <div className="min-h-dvh lg:grid lg:h-dvh lg:grid-cols-[240px_1fr] lg:overflow-hidden">
      <aside className="sticky top-0 z-20 hidden h-dvh flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <RailContent pathname={pathname} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Navigation">
          <div className="lt-fade-in absolute inset-0 bg-black/55" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="lt-pop-in absolute left-0 top-0 flex h-full w-[280px] flex-col bg-sidebar text-sidebar-foreground">
            <div className="flex items-center justify-between px-4 pt-4">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close navigation"
                className="inline-flex size-9 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <XIcon size={18} />
              </button>
            </div>
            <RailContent pathname={pathname} hideBrand />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col lg:min-h-0">
        <TopBar section={section} onMenu={() => setDrawer(true)} />
        <main className="lt-fade-in min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-6 lg:min-h-0 lg:overflow-hidden lg:px-8 lg:pb-6 lg:pt-5">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col">{children}</div>
        </main>
      </div>

      <BottomTabs pathname={pathname} />
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md" aria-label="LoadTruth home">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-brand-fill)] text-white shadow-[0_6px_16px_-4px_var(--color-brand)]">
        <LogoMark size={20} className="text-white" />
      </span>
      <span className="text-[16px] font-bold tracking-tight text-sidebar-foreground">LoadTruth</span>
    </Link>
  );
}

function RailContent({ pathname, hideBrand = false }: { pathname: string; hideBrand?: boolean }) {
  const pending = usePendingCount();
  const palette = usePalette();
  const { can } = useAuth();
  const items = visibleNav(can);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!hideBrand && (
        <div className="px-4 pb-5 pt-5">
          <Brand />
        </div>
      )}

      <div className="px-3 pb-4 lg:pt-0">
        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">
          Event
        </div>
        <EventSwitcher />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3" aria-label="Primary">
        <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">
          Workspace
        </div>
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all ${
                    active
                      ? "bg-[var(--color-brand-fill)] text-white shadow-[0_8px_20px_-8px_var(--color-brand)]"
                      : "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon size={18} className={active ? "text-white" : "text-current"} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && pending > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                        active ? "bg-white/20 text-white" : "bg-[var(--color-brand-fill)] text-white"
                      }`}
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

      <div className="flex flex-col gap-2 border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={palette.open}
          className="flex items-center justify-between rounded-xl border border-sidebar-border bg-sidebar-accent/50 px-3 py-2 text-[12px] text-sidebar-muted transition-colors hover:text-sidebar-foreground"
        >
          <span className="flex items-center gap-2">
            <SearchIcon size={14} /> Quick search
          </span>
          <kbd className="rounded border border-sidebar-border px-1 text-[10px] text-sidebar-muted">⌘K</kbd>
        </button>
        <UserFooter />
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  monitor: "Field Monitor",
  supervisor: "Supervisor",
  county_admin: "County Admin",
  auditor: "Auditor",
  super_admin: "System Owner",
};

function UserFooter() {
  const { member, signOut } = useAuth();
  if (!member) return null;
  const name = member.full_name ?? member.email;
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
        style={{ backgroundColor: "var(--color-brand-fill)" }}
        aria-hidden
      >
        {initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px] font-semibold text-sidebar-foreground">{name}</span>
        <span className="truncate text-[12px] text-sidebar-muted">
          {ROLE_LABEL[member.role] ?? member.role}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        aria-label="Sign out"
        title="Sign out"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
      >
        <LogOutIcon size={16} />
      </button>
    </div>
  );
}

function TopBar({ section, onMenu }: { section: string; onMenu: () => void }) {
  const { selected } = useEventContext();
  const palette = usePalette();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-[color-mix(in_srgb,var(--color-bg)_80%,transparent)] px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open navigation"
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
      >
        <MenuIcon size={20} />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
        <span className="font-semibold text-foreground">{section}</span>
        {selected && (
          <>
            <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden>
              /
            </span>
            <span className="hidden truncate text-muted-foreground sm:inline" title={selected.name}>
              {selected.name}
            </span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={palette.open}
          className="hidden h-9 w-64 items-center justify-between rounded-md border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:border-[var(--color-border-strong)] hover:text-foreground md:flex"
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
          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground md:hidden"
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
  const { can } = useAuth();
  // Keep the bar to four primary destinations on mobile for thumb reach.
  const primary = visibleNav(can)
    .filter((i) => ["/", "/console", "/reports", "/add", "/admin"].includes(i.href))
    .slice(0, 4);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_92%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      style={{ gridTemplateColumns: `repeat(${primary.length}, minmax(0, 1fr))` }}
    >
      {primary.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium"
            style={{ color: active ? "var(--color-brand)" : "var(--muted-foreground)" }}
          >
            <span className="relative">
              <Icon size={20} />
              {item.badge && pending > 0 && (
                <span
                  className="absolute -right-2.5 -top-1.5 rounded-full px-1 text-[10px] font-bold tabular-nums text-white"
                  style={{ backgroundColor: "var(--color-brand-fill)" }}
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
