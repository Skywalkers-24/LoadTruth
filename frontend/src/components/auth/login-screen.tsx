"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, Loader2Icon, ShieldCheckIcon } from "lucide-react";

import { getDirectory, type DirectoryMember, type Role } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LogoMark } from "@/components/ui/logo";
import { Button } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<Role, string> = {
  monitor: "Field Monitor",
  supervisor: "Supervisor",
  county_admin: "County Admin",
  auditor: "Auditor",
  super_admin: "System Owner",
};

const ROLE_BLURB: Record<Role, string> = {
  monitor: "Review tickets and record monitor calls.",
  supervisor: "Review, plus manage trucks and sources.",
  county_admin: "Manage events, rates, and members.",
  auditor: "Read-only access and exports.",
  super_admin: "Full access across the workspace.",
};

/**
 * Sign-in screen. Lists the workspace members and signs in as the chosen one.
 * There is no password in this build; the point the demo proves is that the
 * role travels with the session and is enforced server-side on every action.
 */
export function LoginScreen() {
  const { signIn } = useAuth();
  const directory = useQuery({ queryKey: ["directory"], queryFn: getDirectory, retry: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = directory.data ?? [];

  useEffect(() => {
    if (!selected && members.length > 0) setSelected(members[0]!.email);
  }, [members, selected]);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(selected);
    } catch {
      setError("Could not sign in. Check that the backend is running and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(900px 500px at 15% 0%, color-mix(in srgb, var(--color-brand) 22%, transparent), transparent 70%), radial-gradient(700px 500px at 100% 100%, color-mix(in srgb, var(--color-money) 14%, transparent), transparent 70%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-[var(--color-brand-fill)] text-white shadow-[0_8px_24px_-6px_var(--color-brand)]">
            <LogoMark size={22} className="text-white" />
          </span>
          <span className="text-[18px] font-bold tracking-tight">LoadTruth</span>
        </div>
        <div className="relative flex flex-col gap-4">
          <h1 className="max-w-md text-[30px] font-semibold leading-tight tracking-tight">
            Video-verified load tickets, measured by the cubic yard.
          </h1>
          <p className="max-w-md text-[14px] leading-relaxed text-sidebar-muted">
            Measure truck-bed fill from camera evidence, compare it to the monitor call, and produce
            an auditable payment record for every load.
          </p>
          <div className="mt-2 flex items-center gap-2 text-[13px] text-sidebar-muted">
            <ShieldCheckIcon className="size-4 text-[var(--color-brand-strong)]" />
            Role-based access is enforced on every action.
          </div>
        </div>
        <div className="relative text-[12px] text-sidebar-muted">Sample workspace. Not real haul records.</div>
      </div>

      {/* Sign-in panel */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-fill)] text-white">
              <LogoMark size={20} className="text-white" />
            </span>
            <span className="text-[16px] font-bold tracking-tight">LoadTruth</span>
          </div>

          <h2 className="text-[22px] font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Choose a member to sign in as. Each role sees a different set of actions.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            {directory.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
              ))
            ) : directory.isError ? (
              <p className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-[13px] text-[var(--color-danger)]">
                Could not reach the backend. Make sure the API is running, then refresh.
              </p>
            ) : (
              members.map((m: DirectoryMember) => {
                const active = selected === m.email;
                return (
                  <button
                    key={m.email}
                    type="button"
                    onClick={() => setSelected(m.email)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                      active
                        ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] ring-1 ring-[var(--color-brand)]"
                        : "border-border hover:border-[var(--color-border-strong)] hover:bg-accent",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-brand-fill)] text-[12px] font-bold text-white">
                      {(m.full_name ?? m.email).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] font-semibold">{m.full_name ?? m.email}</span>
                      <span className="truncate text-[12px] text-muted-foreground">
                        {ROLE_LABEL[m.role]} · {ROLE_BLURB[m.role]}
                      </span>
                    </span>
                    {active && <ArrowRightIcon className="size-4 shrink-0 text-[var(--color-brand)]" />}
                  </button>
                );
              })
            )}
          </div>

          {error && <p className="mt-3 text-[13px] text-[var(--color-danger)]">{error}</p>}

          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={!selected || submitting}
            onClick={submit}
          >
            {submitting ? <Loader2Icon className="animate-spin" /> : null}
            {submitting ? "Signing in" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
