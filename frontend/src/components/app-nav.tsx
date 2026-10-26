"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";

const LINKS = [
  { href: "/console", label: "Console" },
  { href: "/reports", label: "Reports" },
  { href: "/admin", label: "Admin" },
];

/** Top navigation shared across app screens. Responsive + theme toggle. */
export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg)_85%,transparent)] backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/console" className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-[var(--color-accent)]" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">LoadTruth</span>
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className="rounded-md px-3 py-1.5 text-sm transition-colors"
                style={{
                  color: active ? "var(--color-text)" : "var(--color-muted)",
                  backgroundColor: active
                    ? "color-mix(in srgb, var(--color-accent) 12%, transparent)"
                    : "transparent",
                }}
              >
                {l.label}
              </Link>
            );
          })}
          <div className="ml-1">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
