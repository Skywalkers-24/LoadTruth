"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  BuildingIcon,
  DollarSignIcon,
  FileCheck2Icon,
  Loader2Icon,
  MicIcon,
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

const LOGIN_FEATURES: { icon: ReactNode; title: string; subtitle: string }[] = [
  { icon: <SparklesIcon size={18} />, title: "AI assistant", subtitle: "Ask about a load" },
  { icon: <MicIcon size={18} />, title: "Voice reports", subtitle: "Monitor calls" },
  { icon: <DollarSignIcon size={18} />, title: "Load estimate", subtitle: "Debris fill" },
  { icon: <ShieldAlertIcon size={18} />, title: "Review flags", subtitle: "Issues to check" },
  { icon: <BuildingIcon size={18} />, title: "Multi-tenant", subtitle: "Separate workspaces" },
  { icon: <FileCheck2Icon size={18} />, title: "Audit reports", subtitle: "Review records" },
  { icon: <ScanEyeIcon size={18} />, title: "Evidence", subtitle: "Saved video" },
];

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

  const members = (directory.data ?? []).filter((m) => m.role !== "super_admin");
  const wakingUp = directory.isError && isServerWakingUp(directory.error);

  useEffect(() => {
    if (!selected && members.length > 0) setSelected(members[0]!.email);
  }, [members, selected]);

  async function submit(targetEmail?: string) {
    const emailToUse = targetEmail ?? selected;
    if (!emailToUse) return;
    setSelected(emailToUse);
    setSubmitting(true);
    setError(null);
    try {
      await signIn(emailToUse);
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
          <div className="flex items-center gap-3.5 [text-shadow:0_1px_12px_rgba(0,0,0,0.55)]">
            <LogoMark size={56} forceTheme="dark" />
            <span className="text-[28px] font-bold tracking-tight text-white">LoadTruth</span>
          </div>

          {/* The copy sits directly on the gradient scrim with a strong
              text-shadow for crispness, so there is no visible blurred box. */}
          <div className="relative flex max-w-md flex-col gap-3.5 [text-shadow:0_2px_18px_rgba(0,0,0,0.85),0_1px_3px_rgba(0,0,0,0.9)]">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm [text-shadow:none]">
              <span className="size-1.5 rounded-full bg-[var(--color-brand)]" aria-hidden />
              Evidence-backed load review
            </span>
            {/* Highlighted headline: brighter, heavier, with a glow so it pops
                over the footage. */}
            <h1 className="text-[clamp(26px,2.25vw,32px)] font-extrabold leading-[1.12] tracking-tight text-white">
              Precision load intelligence for <span className="text-[#7dd3fc]">disaster debris removal.</span>
            </h1>
            <p className="text-[14px] font-medium leading-relaxed text-white/90">
              LoadTruth reviews truck footage in real time with Meta SAM 3.1 &amp; Muse Spark 1.3—estimating volumetric fill, verifying certified capacity, and generating defensible audit records for FEMA reimbursement.
            </p>
          </div>
        </div>

        {/* Spacer so the footer stays pinned to the bottom. */}
        <div className="flex-1" aria-hidden />

        <div className="relative flex flex-col items-start gap-2.5 text-[12px] font-medium text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.9),0_1px_2px_rgba(0,0,0,0.9)]">
          <div className="space-y-1">
            <p>AI estimates · video evidence · human review</p>
            <p className="font-semibold text-white/95">Powered by Meta SAM 3.1 &amp; Muse Spark 1.3</p>
            <p className="text-white/80">Live inference via Meta Model API (api.meta.ai/v1)</p>
          </div>
          <Link
            href="/showcase"
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-white underline-offset-4 hover:underline"
          >
            Project overview
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* Sign-in panel. The left edge fades in from the video; the card stays
          legible on the themed background and scrolls on short viewports. */}
      <div className="login-screen-panel relative z-10 flex min-h-0 flex-col items-center justify-start gap-5 overflow-y-auto bg-gradient-to-r from-transparent via-background/80 to-background px-6 pb-6 pt-16 backdrop-blur-md lg:pt-16 xl:pt-20">
        {/* Theme picker — reachable before sign-in so users land in their preferred look. */}
        <div className="absolute right-5 top-5 z-10">
          <ThemeToggle />
        </div>
        <div className="login-screen-content flex w-full max-w-5xl flex-col gap-4">
          <div className="login-screen-card mx-auto w-full max-w-md rounded-2xl border border-border bg-[var(--color-surface)]/90 p-6 shadow-xl backdrop-blur-xl sm:p-7">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <LogoMark size={46} />
              <span className="text-[24px] font-bold tracking-tight">LoadTruth</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[22px] font-semibold tracking-tight">Demo sign-in</h2>
              <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                No password required
              </span>
            </div>
            <p className="mt-1 text-[13px] font-medium text-foreground/75">
              Choose a demo role to continue. Each role sees a different set of actions.
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
                      Render&apos;s free tier spins down after 15 minutes of inactivity. Starting
                      the container takes ~30–60 seconds. Reconnecting automatically...
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
                    <div
                      key={m.email}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (active) {
                          void submit(m.email);
                        } else {
                          setSelected(m.email);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void submit(m.email);
                        }
                      }}
                      className={cn(
                        "login-screen-member-button group flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all select-none",
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

                      <button
                        type="button"
                        title={`Sign in as ${m.full_name ?? m.email}`}
                        aria-label={`Sign in as ${m.full_name ?? m.email}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void submit(m.email);
                        }}
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-lg transition-all",
                          active
                            ? "bg-[var(--color-brand)] text-white shadow-sm hover:opacity-90 cursor-pointer"
                            : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground cursor-pointer",
                        )}
                      >
                        {submitting && active ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          <ArrowRightIcon className="size-4" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {error && <p className="mt-3 text-[13px] text-[var(--color-danger)]">{error}</p>}

            <Button
              className="login-screen-continue mt-5 w-full"
              size="default"
              disabled={!selected || submitting}
              onClick={() => void submit()}
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

            <div className="mt-4">
              <Link
                href="/superadmin"
                className="flex w-full items-center justify-between rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-[var(--color-border-strong)] hover:bg-accent hover:text-foreground"
              >
                Administrator
                <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-1.5 min-[480px]:grid-cols-3 lg:grid-cols-7">
            {LOGIN_FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-border bg-[var(--color-surface)]/80 px-1 py-2 text-center backdrop-blur-sm"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                  {feature.icon}
                </span>
                <span className="text-[11px] font-semibold leading-tight text-foreground">
                  {feature.title}
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {feature.subtitle}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
