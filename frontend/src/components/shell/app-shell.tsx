"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AssistantWidget } from "@/components/ai/assistant-widget";
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
  TruckIcon,
  XIcon,
} from "@/components/ui/icons";
import {
  ActivityIcon,
  FilmIcon,
  BookOpenIcon,
  CircleDollarSignIcon,
  LogOutIcon,
  PanelLeftIcon,
  PlusIcon,
  SparklesIcon,
} from "lucide-react";

import type { Capabilities } from "@/lib/api";
import { Kbd } from "@/components/ui/kbd";
import { LogoMark } from "@/components/ui/logo";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useReportsSummary } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: boolean;
  /** Only shown when the signed-in member has this capability. */
  cap?: keyof Capabilities;
  /** Shown when the member has any one of these capabilities. */
  anyCap?: (keyof Capabilities)[];
};

// Separate records, capture, processing, and exception review.
const NAV: NavItem[] = [
  { href: "/", label: "Overview", short: "Overview", icon: GaugeIcon },
  { href: "/console", label: "Console", short: "Console", icon: ClipboardIcon, badge: true },
  { href: "/add", label: "Add footage", short: "New", icon: PlusIcon },
  { href: "/demos", label: "Video library", short: "Footage", icon: FilmIcon },
  { href: "/pipeline", label: "Analysis runs", short: "Analysis", icon: ActivityIcon },
  { href: "/assistant", label: "AI assistant", short: "Assistant", icon: SparklesIcon },
  { href: "/tickets", label: "All tickets", short: "Ticket", icon: ClipboardIcon },
  { href: "/trucks", label: "Trucks", short: "Trucks", icon: TruckIcon, cap: "manage_trucks" },
  { href: "/reports", label: "Reports", short: "Reports", icon: ChartIcon },
  { href: "/billing", label: "Billing", short: "Billing", icon: CircleDollarSignIcon },
  {
    href: "/admin",
    label: "Settings",
    short: "Settings",
    icon: SettingsIcon,
    // Supervisors manage sources here; county/super admins get every tab.
    anyCap: ["manage_events", "manage_sources", "manage_users"],
  },
  { href: "/guide", label: "Guide", short: "Guide", icon: BookOpenIcon },
];

function visibleNav(can: (c: keyof Capabilities) => boolean): NavItem[] {
  return NAV.filter((item) => {
    if (item.cap && !can(item.cap)) return false;
    if (item.anyCap && !item.anyCap.some(can)) return false;
    return true;
  });
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

const COLLAPSE_KEY = "loadtruth-rail-collapsed-mocha";

/**
 * Application shell. Desktop: a collapsible left rail + sticky top bar that
 * carries the event switcher. Mobile: compact top bar, slide-over drawer, and a
 * bottom tab bar. The rail collapse state is persisted.
 */
export function AppShell({
  children,
  section,
  fluid = false,
}: {
  children: ReactNode;
  section: string;
  /** Use the full window width (one-screen workspaces) instead of a centered column. */
  fluid?: boolean;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    document.title = `${section} · LoadTruth`;
  }, [section]);
  useEffect(() => {
    // An explicit choice wins. Otherwise start collapsed on laptop and tablet
    // widths (13-inch MacBook, iPad landscape) so the workspace gets the room.
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    setCollapsed(stored === null ? false : stored === "1");
  }, []);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <div
      className="min-h-dvh lg:grid lg:h-dvh lg:overflow-hidden lg:transition-[grid-template-columns] lg:duration-300 lg:ease-out"
      style={{ gridTemplateColumns: collapsed ? "72px 1fr" : "224px 1fr" }}
    >
      <a href="#workspace-main" className="lt-skip-link">
        Skip to workspace
      </a>
      <aside className="sticky top-0 z-20 hidden h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground  lg:flex">
        <RailContent pathname={pathname} collapsed={collapsed} onToggle={toggleCollapse} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Navigation">
          <div
            className="lt-fade-in absolute inset-0 bg-black/55"
            onClick={() => setDrawer(false)}
            aria-hidden
          />
          <aside className="lt-sidebar-drawer-in absolute left-0 top-0 flex h-full w-[280px] flex-col bg-sidebar text-sidebar-foreground">
            <div className="flex items-center justify-between px-4 pt-4">
              <Brand collapsed={false} />
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close navigation"
                className="inline-flex size-9 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="px-3 pb-3 pt-4">
              <EventSwitcher />
            </div>
            <RailContent pathname={pathname} hideBrand collapsed={false} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col lg:min-h-0">
        <TopBar section={section} onMenu={() => setDrawer(true)} />
        <main
          id="workspace-main"
          tabIndex={-1}
          className="lt-fade-in min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-6 lg:min-h-0 lg:overflow-hidden lg:px-6 lg:pb-4 lg:pt-4 2xl:px-8 2xl:pb-5"
        >
          <div
            className={cn(
              "mx-auto flex h-full min-h-0 w-full flex-col",
              !fluid && "max-w-[1600px]",
            )}
          >
            {children}
          </div>
        </main>
      </div>

      <BottomTabs pathname={pathname} />

      {/* AI Analyst — available on every page, labelled with the current screen. */}
      {!["/assistant", "/console", "/demos"].includes(pathname) && (
        <AssistantWidget page={section} />
      )}
    </div>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 rounded-md" aria-label="LoadTruth home">
      <LogoMark size={collapsed ? 32 : 36} className="shrink-0" />
      {!collapsed && (
        <span className="text-[17px] font-bold tracking-tight text-sidebar-foreground">
          LoadTruth
        </span>
      )}
    </Link>
  );
}

function RailContent({
  pathname,
  hideBrand = false,
  collapsed,
  onToggle,
}: {
  pathname: string;
  hideBrand?: boolean;
  collapsed: boolean;
  onToggle?: () => void;
}) {
  const pending = usePendingCount();
  const { can } = useAuth();
  const items = visibleNav(can);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!hideBrand && (
        <div
          className={cn(
            "flex items-center pb-5 pt-5",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          <Brand collapsed={collapsed} />
          {onToggle && !collapsed && (
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              className="inline-flex size-7 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <PanelLeftIcon size={16} />
            </button>
          )}
        </div>
      )}

      {onToggle && collapsed && (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="inline-flex size-8 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <PanelLeftIcon size={16} />
          </button>
        </div>
      )}

      <nav className="min-h-0 flex-1 overflow-y-auto px-3" aria-label="Primary">
        {!collapsed && (
          <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
            Workspace
          </div>
        )}
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const link = (
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center rounded-lg text-[13.5px] font-medium transition-colors duration-150",
                  collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <span className="relative">
                  <Icon
                    size={18}
                    className={cn(
                      "transition-colors",
                      active ? "text-sidebar-accent-foreground" : "text-current",
                    )}
                  />
                  {collapsed && item.badge && pending > 0 && (
                    <span className="absolute -right-2 -top-1.5 rounded-full bg-[var(--color-brand-fill)] px-1 text-[9px] font-bold text-white">
                      {pending}
                    </span>
                  )}
                </span>
                {!collapsed && <span className="flex-1">{item.label}</span>}
                {!collapsed && item.badge && pending > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "bg-[var(--color-brand)]/15 text-[var(--color-brand-strong)]",
                    )}
                    aria-label={`${pending} awaiting review`}
                  >
                    {pending}
                  </span>
                )}
              </Link>
            );
            return (
              <li key={item.href}>
                {!collapsed && ["/tickets", "/billing"].includes(item.href) && (
                  <div className="mb-2 mt-5 px-3 text-[10px] font-medium uppercase tracking-widest text-sidebar-muted">
                    {item.href === "/tickets" ? "Records" : "Workspace tools"}
                  </div>
                )}
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-2 border-t border-sidebar-border p-3">
        <UserFooter collapsed={collapsed} />
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

function UserFooter({ collapsed }: { collapsed: boolean }) {
  const { member, signOut } = useAuth();
  const router = useRouter();

  if (!member) return null;
  const name = member.full_name ?? member.email;
  const avatar = <MemberAvatar seed={member.email} />;

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
  };

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={name}>
              {avatar}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {name} · {ROLE_LABEL[member.role] ?? member.role}
          </TooltipContent>
        </Tooltip>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          aria-label="Sign out"
          title="Sign out"
          className="inline-flex size-8 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <LogOutIcon size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
      {avatar}
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13px] font-semibold text-sidebar-foreground">{name}</span>
        <span className="truncate text-[12px] text-sidebar-muted">
          {ROLE_LABEL[member.role] ?? member.role}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void handleSignOut()}
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
  const palette = usePalette();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background px-4  sm:px-6 lg:px-8">
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
      </nav>

      {/* Event switcher lives in the top bar now, next to the workspace context. */}
      <div className="ml-3 hidden min-w-0 max-w-[460px] flex-1 sm:block">
        <EventSwitcher compact />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={palette.open}
          className="hidden h-9 w-56 items-center justify-between rounded-md border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:border-[var(--color-border-strong)] hover:text-foreground xl:flex"
        >
          <span className="flex items-center gap-2">
            <SearchIcon size={14} /> Search
          </span>
          <Kbd>⌘K</Kbd>
        </button>
        <button
          type="button"
          onClick={palette.open}
          aria-label="Search"
          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground xl:hidden"
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
  const primary = visibleNav(can)
    .filter((i) => ["/", "/tickets", "/add", "/console"].includes(i.href))
    .slice(0, 4);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-[color-mix(in_srgb,var(--color-surface)_92%,transparent)] pb-[env(safe-area-inset-bottom)]  lg:hidden"
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
