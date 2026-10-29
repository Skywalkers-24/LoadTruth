"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

import { getDirectory, isServerWakingUp, type DirectoryMember, type Role } from "@/lib/api";
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
  const router = useRouter();
  const { signIn } = useAuth();
  const directory = useQuery({
    queryKey: ["directory"],
    queryFn: getDirectory,
    refetchInterval: (query) => (query.state.status === "error" ? 4_000 : false),
    retry: (failureCount) => failureCount < 15,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = directory.data ?? [];
  const wakingUp = directory.isError && isServerWakingUp(directory.error);

  useEffect(() => {
    if (!selected && members.length > 0) setSelected(members[0]!.email);
  }, [members, selected]);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(selected);
      router.push("/");
    } catch (err) {
      if (isServerWakingUp(err)) {
        setError("The server is still starting up on Render. Please wait a moment and try again.");
      } else {
        setError("Could not sign in. Check that the backend is running and try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="relative grid h-dvh min-h-dvh overflow-hidden lg:grid-cols-2">
      {/* Mode-aware video background behind everything (lazy, muted, looped). */}
      <LoginVideoBg />

      {/* Brand panel. Transparent with no panel-wide blur so the truck footage
          stays crisp; legibility comes from a soft left-edge gradient and a
          text-shadow on the copy instead. The z-10 lifts it above the video. */}
      <div className="relative z-10 hidden min-h-0 flex-col justify-start overflow-hidden p-7 pb-4 text-sidebar-foreground xl:p-10 xl:pb-5 lg:flex">
        {/* Legibility scrim concentrated at the TOP-LEFT, where the logo + copy
            now sit (the clear studio area above/left of the truck). A radial
            wash anchored top-left plus a gentle top-edge wash fade fully to
            transparent, so there is no visible box and the truck stays crisp in
            the center/lower-right. Mode independent so white text reads in light
            mode too. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 0% 0%, rgba(4,8,20,0.82) 0%, rgba(4,8,20,0.45) 32%, rgba(4,8,20,0.12) 52%, transparent 70%), linear-gradient(180deg, rgba(4,8,20,0.45) 0%, transparent 28%), linear-gradient(0deg, rgba(4,8,20,0.6) 0%, transparent 18%)",
          }}
        />
        {/* Logo + the copy both live in the top-left, which is the clear studio
            background in the footage (the truck sits center/lower-right), so the
            text never fights the wireframe. A flex spacer then pushes the footer
            to the bottom. */}
        <div className="relative flex flex-col gap-6">
          <div className="flex items-center gap-3 [text-shadow:0_1px_12px_rgba(0,0,0,0.55)]">
            <LogoMark size={48} />
            <span className="text-[26px] font-bold tracking-tight text-white">LoadTruth</span>
          </div>

          {/* The copy sits directly on the gradient scrim with a strong
              text-shadow for crispness, so there is no visible blurred box. */}
          <div className="relative flex max-w-md flex-col gap-3.5 [text-shadow:0_2px_18px_rgba(0,0,0,0.85),0_1px_3px_rgba(0,0,0,0.9)]">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm [text-shadow:none]">
              <span className="size-1.5 rounded-full bg-[var(--color-brand)]" aria-hidden />
              Disaster-debris billing, verified
            </span>
            {/* Highlighted headline: brighter, heavier, with a glow so it pops
                over the footage. */}
            <h1 className="text-[clamp(26px,2.25vw,32px)] font-extrabold leading-[1.12] tracking-tight text-white">
              Every debris haul, <span className="text-[#7dd3fc]">measured and paid</span> on the
              evidence.
            </h1>
            <p className="text-[14px] font-medium leading-relaxed text-white/90">
              Counties pay contractors by the cubic yard to clear debris. LoadTruth measures each
              truckload from the footage, checks it against the monitor&apos;s call, and produces a
              payment record ready for a Federal Emergency Management Agency (FEMA) audit.
            </p>
          </div>
        </div>

        {/* Spacer so the footer stays pinned to the bottom. */}
        <div className="flex-1" aria-hidden />

        <div className="relative flex items-center justify-between gap-3 text-[12px] font-medium text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.9),0_1px_2px_rgba(0,0,0,0.9)]">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-[#7dd3fc]" aria-hidden />
            Powered by Meta SAM 3.1 and Muse Spark
          </span>
          <a
            href="/showcase"
            className="inline-flex items-center gap-1 font-semibold text-white underline-offset-4 hover:underline"
          >
            View the public showcase
            <ArrowRightIcon className="size-3.5" />
          </a>
        </div>
      </div>

      {/* Sign-in panel. The left edge fades in from the video (no hard seam at
          the column split); the rest sits on the themed background so the card
          and capability strip stay fully legible. z-10 lifts it above the video
          layer. Scrolls when the content exceeds the viewport. */}
      <div className="login-screen-panel relative z-10 flex min-h-0 flex-col items-center justify-start gap-5 overflow-y-auto bg-gradient-to-r from-transparent via-background/80 to-background px-6 pb-6 pt-16 backdrop-blur-md lg:pt-16 xl:pt-20">
        {/* Theme picker — reachable before sign-in so users land in their preferred look. */}
        <div className="absolute right-5 top-5 z-10">
          <ThemeToggle />
        </div>
        <div className="login-screen-content flex w-full max-w-md flex-col gap-4">
          <div className="login-screen-card w-full rounded-2xl border border-border bg-[var(--color-surface)]/90 p-6 shadow-xl backdrop-blur-xl sm:p-7">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <LogoMark size={40} />
              <span className="text-[22px] font-bold tracking-tight">LoadTruth</span>
            </div>

            <h2 className="text-[22px] font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-[13px] font-medium text-foreground/75">
              Choose a member to sign in as. Each role sees a different set of actions.
            </p>

            <div className="login-screen-member-list mt-5 flex flex-col gap-2">
              {directory.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                ))
              ) : directory.isError ? (
                wakingUp ? (
                  <div className="rounded-xl border border-[var(--color-warn,#f59e0b)]/40 bg-[var(--color-warn,#f59e0b)]/10 p-4 text-[13px]">
                    <div className="flex items-center gap-2 font-semibold text-[var(--color-warn,#f59e0b)]">
                      <Loader2Icon className="size-4 animate-spin shrink-0" />
                      <span>Backend server is waking up on Render...</span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                      Render&apos;s free tier spins down after 15 minutes of inactivity. Starting the container takes ~30–60 seconds. Reconnecting automatically...
                    </p>
                  </div>
                ) : (
                  <p className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] px-4 py-3 text-[13px] text-[var(--color-danger)]">
                    Could not reach the backend. Make sure the API is running, then refresh.
                  </p>
                )
              ) : (
                members.map((m: DirectoryMember) => {
                  const active = selected === m.email;
                  return (
                    <button
                      key={m.email}
                      type="button"
                      onClick={() => setSelected(m.email)}
                      className={cn(
                        "login-screen-member-button flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                        active
                          ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)] ring-1 ring-[var(--color-brand)]"
                          : "border-border hover:border-[var(--color-border-strong)] hover:bg-accent",
                      )}
                    >
                      <MemberAvatar seed={m.email} />

                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13px] font-semibold">
                          {m.full_name ?? m.email}
                        </span>
                        <span className="truncate text-[11px] text-muted-foreground">
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
              className="login-screen-continue mt-5 w-full"
              size="default"
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

        {/* Condensed proof strip below the card. It spans the full right-side
            width (not the card's max-w) so the three numbers and the six
            capabilities each read in a single row on desktop. */}
        <div className="login-screen-proof flex w-full max-w-3xl flex-col gap-2.5">
          <div className="grid grid-cols-3 gap-2">
            <MiniStat value="$1,402" label="Over-calls / event" />
            <MiniStat value="7" label="AI stages / clip" />
            <MiniStat value="100%" label="Traced to evidence" />
          </div>
          {/* Six compact capabilities in one horizontal row on desktop. They
            wrap to a 3-up then 2-up grid only on narrow screens where a single
            row can't fit, keeping each card equal width. */}
          <ul className="login-screen-features grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3 lg:grid-cols-6">
            <MiniFeature
              icon={<ScanEyeIcon className="size-3.5" />}
              title="Measured"
              subtitle="SAM 3.1"
            />
            <MiniFeature
              icon={<DollarSignIcon className="size-3.5" />}
              title="Money frame"
              subtitle="Visual evidence"
            />
            <MiniFeature
              icon={<ShieldAlertIcon className="size-3.5" />}
              title="Anomaly"
              subtitle="Risk checks"
            />
            <MiniFeature
              icon={<SparklesIcon className="size-3.5" />}
              title="AI analyst"
              subtitle="Muse Spark"
            />
            <MiniFeature
              icon={<FileCheck2Icon className="size-3.5" />}
              title="Audit exports"
              subtitle="Evidence trail"
            />
            <MiniFeature
              icon={<BuildingIcon className="size-3.5" />}
              title="Multi-tenant"
              subtitle="Role isolation"
            />
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Compact stat chip shown under the sign-in card (short label, no sentence). */
function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-[var(--color-surface)]/70 px-2 py-1.5 text-center backdrop-blur-sm">
      <div className="text-[13px] font-bold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[9.5px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * Compact capability card: small icon above a short title and a one-word
 * subtitle naming the model or evidence behind it. Sized to sit six across in
 * one row under the sign-in card; wraps to a 3-up/2-up grid on narrow screens.
 */
function MiniFeature({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <li className="flex flex-col items-center gap-1 rounded-lg border border-border bg-[var(--color-surface)]/70 px-1.5 py-1.5 text-center backdrop-blur-sm">
      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
        {icon}
      </span>
      <span className="text-[10px] font-semibold leading-tight text-foreground">{title}</span>
      <span className="text-[9px] leading-tight text-muted-foreground">{subtitle}</span>
    </li>
  );
}
