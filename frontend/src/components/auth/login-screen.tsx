"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  BuildingIcon,
  DollarSignIcon,
  FileCheck2Icon,
  Loader2Icon,
  ScanEyeIcon,
  ShieldAlertIcon,
  SparklesIcon,
} from "lucide-react";

import { getDirectory, type DirectoryMember, type Role } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LoginVideoBg } from "@/components/auth/login-video-bg";
import { LogoMark } from "@/components/ui/logo";
import { MemberAvatar } from "@/components/ui/member-avatar";
import { Button } from "@/components/ui/shadcn/button";
import { ThemeToggle } from "@/components/theme-toggle";
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
    <div className="relative grid min-h-dvh overflow-hidden lg:grid-cols-2">
      {/* Mode-aware video background behind everything (lazy, muted, looped). */}
      <LoginVideoBg />

      {/* Brand panel. Semi-transparent so the video shows through; the gradient
          and a blur keep the headline and stats readable over the footage. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar/70 p-10 text-sidebar-foreground backdrop-blur-sm lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(900px 500px at 15% 0%, color-mix(in srgb, var(--color-brand) 22%, transparent), transparent 70%), radial-gradient(700px 500px at 100% 100%, color-mix(in srgb, var(--color-money) 14%, transparent), transparent 70%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <LogoMark size={34} />
          <span className="text-[18px] font-bold tracking-tight">LoadTruth</span>
        </div>

        <div className="relative flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-strong)]">
              Disaster-debris billing, verified
            </span>
            <h1 className="max-w-md text-[30px] font-semibold leading-tight tracking-tight">
              Every debris haul, measured and paid on the evidence.
            </h1>
            <p className="max-w-md text-[14px] leading-relaxed text-sidebar-muted">
              Counties pay contractors by the cubic yard to clear debris. LoadTruth measures each
              truckload from the footage, checks it against the monitor&apos;s call, and produces a
              payment record ready for a Federal Emergency Management Agency (FEMA) audit.
            </p>
          </div>

          {/* The numbers that make the case */}
          <div className="grid max-w-lg grid-cols-3 gap-3">
            <Stat value="$1,402" label="Over-calls caught per event" />
            <Stat value="7 stages" label="AI pipeline per clip" />
            <Stat value="100%" label="Decisions traced to evidence" />
          </div>

          {/* Capabilities, one tight line each */}
          <ul className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-4">
            <Feature
              icon={<ScanEyeIcon className="size-4" />}
              title="Measured from footage"
              body="SAM 3.1 segments the load; Muse reads the placard and classifies the debris."
            />
            <Feature
              icon={<DollarSignIcon className="size-4" />}
              title="The money frame"
              body="Measured value against the monitor's call, with the exact dollar delta."
            />
            <Feature
              icon={<ShieldAlertIcon className="size-4" />}
              title="Anomaly detection"
              body="Over-calls, surface-versus-depth gaps, and unreadable placards flagged automatically."
            />
            <Feature
              icon={<SparklesIcon className="size-4" />}
              title="Grounded AI analyst"
              body="Ask about exposure or disputes and get answers from your own data."
            />
            <Feature
              icon={<FileCheck2Icon className="size-4" />}
              title="Audit-ready exports"
              body="Signed tickets, anomaly logs, CSV, and FEMA-style packets."
            />
            <Feature
              icon={<BuildingIcon className="size-4" />}
              title="Multi-tenant"
              body="Each agency runs its own events, trucks, rates, and team."
            />
          </ul>
        </div>

        <div className="relative flex items-center justify-between gap-3 text-[12px] text-sidebar-muted">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-[var(--color-brand-strong)]" aria-hidden />
            Powered by Meta SAM 3.1 and Muse Spark
          </span>
          <a
            href="/showcase"
            className="inline-flex items-center gap-1 font-medium text-[var(--color-brand-strong)] underline-offset-4 hover:underline"
          >
            View the public showcase
            <ArrowRightIcon className="size-3.5" />
          </a>
        </div>
      </div>

      {/* Sign-in panel. Semi-transparent over the video; the sign-in card itself
          sits on a solid surface so every control stays fully legible. */}
      <div className="relative flex items-center justify-center bg-background/55 p-6 backdrop-blur-md">
        {/* Theme picker — reachable before sign-in so users land in their preferred look. */}
        <div className="absolute right-5 top-5 z-10">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md rounded-2xl border border-border bg-[var(--color-surface)]/90 p-6 shadow-xl backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <LogoMark size={30} />
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
                    <MemberAvatar seed={m.email} />

                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] font-semibold">
                        {m.full_name ?? m.email}
                      </span>
                      <span className="truncate text-[12px] text-muted-foreground">
                        {ROLE_LABEL[m.role]} · {ROLE_BLURB[m.role]}
                      </span>
                    </span>
                    {active && (
                      <ArrowRightIcon className="size-4 shrink-0 text-[var(--color-brand)]" />
                    )}
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

          <div className="mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--color-border)]" aria-hidden />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              New here?
            </span>
            <span className="h-px flex-1 bg-[var(--color-border)]" aria-hidden />
          </div>
          <a
            href="/showcase"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-brand)]/40 bg-[var(--color-brand-soft)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-brand)] transition-colors hover:bg-[var(--color-brand)]/15"
          >
            See the public showcase
            <ArrowRightIcon className="size-4" />
          </a>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <div className="text-[18px] font-bold tabular-nums text-sidebar-foreground">{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-sidebar-muted">{label}</div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[var(--color-brand-strong)] ring-1 ring-white/[0.06]">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-[13.5px] font-semibold text-sidebar-foreground">{title}</span>
        <span className="text-[12.5px] leading-relaxed text-sidebar-muted">{body}</span>
      </span>
    </li>
  );
}
