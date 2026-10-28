"use client";

import { type ReactNode } from "react";

import { LockIcon } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { Card } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import type { Capabilities } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Page-level role guard. Wraps a screen so a member who lacks the required
 * capability sees a clean "not available for your role" state instead of the
 * screen's controls. Authorization is still enforced server-side; this is the
 * usability layer that keeps a lower role from reaching a page by typing its
 * URL or following a stale link.
 *
 * Pass one capability, or several in `anyOf` (access if the member has any of
 * them). The gate renders its own AppShell so the message keeps the app chrome.
 */
export function AccessGate({
  capability,
  anyOf,
  section,
  message,
  children,
}: {
  capability?: keyof Capabilities;
  anyOf?: (keyof Capabilities)[];
  /** Shell section label, shown in the top bar while access is denied. */
  section: string;
  /** What the member is missing, in plain language. */
  message?: string;
  children: ReactNode;
}) {
  const { can, loading } = useAuth();
  const required = anyOf ?? (capability ? [capability] : []);
  const allowed = required.length === 0 || required.some((c) => can(c));

  if (loading) {
    return (
      <AppShell section={section}>
        <Skeleton className="mx-auto mt-10 h-48 w-full max-w-md rounded-xl" />
      </AppShell>
    );
  }

  if (!allowed) {
    return (
      <AppShell section={section}>
        <Card className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 p-8 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-secondary text-muted-foreground">
            <LockIcon className="size-5" />
          </span>
          <h1 className="text-[16px] font-semibold text-foreground">Not available for your role</h1>
          <p className="text-[13px] text-muted-foreground">
            {message ?? "You don't have access to this screen. Ask an admin if you need it."}
          </p>
        </Card>
      </AppShell>
    );
  }

  return <>{children}</>;
}
