"use client";

import { useEffect, useState } from "react";

import type { Ticket, TicketStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AlertIcon, CheckIcon, InfoIcon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useEvents } from "@/lib/hooks";
import { useAuth } from "@/lib/auth";
import { useSetMonitorCall, useSetStatus } from "@/lib/hooks";
import { percent } from "@/lib/format";
import { isTypingTarget } from "@/lib/use-media-query";

/**
 * Human review controls: record the monitor's fill call, then confirm, override,
 * or dispute. Override and dispute require a reason. Keyboard: C confirm,
 * O override, D dispute (ignored while typing).
 */
type Decision = Exclude<TicketStatus, "draft">;

const COPY: Record<
  Decision,
  { title: string; body: string; cta: string; variant: "ok" | "warn" | "danger"; done: string }
> = {
  confirmed: {
    title: "Confirm this ticket?",
    body: "LoadTruth's visual estimate becomes the ticket of record for this load.",
    cta: "Confirm",
    variant: "ok",
    done: "confirmed",
  },
  overridden: {
    title: "Override this ticket?",
    body: "The ticket is marked as manually adjusted. Add a reason for the audit trail.",
    cta: "Override",
    variant: "warn",
    done: "overridden",
  },
  disputed: {
    title: "Dispute this ticket?",
    body: "The ticket is flagged for resolution with the contractor. Add a reason for the audit trail.",
    cta: "Dispute",
    variant: "danger",
    done: "disputed",
  },
};

export function ReviewActions({
  ticket,
  layout = "stack",
}: {
  ticket: Ticket;
  /** `stack` for a narrow card; `bar` for the one-row action bar under the evidence. */
  layout?: "stack" | "bar";
}) {
  const toast = useToast();
  const { can, member } = useAuth();
  const events = useEvents();
  const event = events.data?.find((item) => item.id === ticket.event_id);
  const canReview = Boolean(
    event &&
    !event.tags.includes("read-only") &&
    (!event.tags.includes("admin-only") || member?.role === "super_admin") &&
    (event.tags.includes("playground") || can("review_tickets")),
  );
  const setMonitorCall = useSetMonitorCall();
  const setStatus = useSetStatus();

  const [call, setCall] = useState(() => {
    const raw = ticket.valuation.monitor_fill_pct;
    if (raw === null) return "";
    const n = Number.parseFloat(raw);
    return Number.isNaN(n) ? "" : String(Math.round(n * 10) / 10);
  });
  const [showCall, setShowCall] = useState(ticket.valuation.monitor_fill_pct !== null);
  const [pending, setPending] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");

  const practice = event?.tags.includes("playground");
  const busy = setMonitorCall.isPending || setStatus.isPending;
  const needsReason = pending === "overridden" || pending === "disputed";
  const reasonValid = reason.trim().length >= 4;
  const decided = ticket.status !== "draft";
  const callNumber = Number(call);
  const callValid =
    call.trim() !== "" && Number.isFinite(callNumber) && callNumber >= 0 && callNumber <= 100;
  const callChanged =
    ticket.valuation.monitor_fill_pct === null ||
    callNumber !== Number(ticket.valuation.monitor_fill_pct);

  const unsavedCall = call.trim() !== "" && callChanged;

  // Keyboard shortcuts for the three decisions.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        !canReview ||
        unsavedCall ||
        pending ||
        busy ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        isTypingTarget(e.target)
      )
        return;
      // Don't fire decisions while any dialog/popover is open (notifications,
      // command palette, confirm dialog) — matches the queue's J/K guard.
      if (document.querySelector('[role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (k === "c") setPending("confirmed");
      else if (k === "o") setPending("overridden");
      else if (k === "d") setPending("disputed");
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, busy, canReview, unsavedCall]);

  function submitCall(e: React.FormEvent) {
    e.preventDefault();
    const pct = call.trim();
    if (!callValid || !callChanged) return;
    setMonitorCall.mutate(
      { id: ticket.id, pct },
      {
        onSuccess: () => toast.push("ok", `Monitor call of ${percent(pct)} recorded.`),
        onError: () => toast.push("danger", "Could not record the monitor call."),
      },
    );
  }

  function confirmAction() {
    if (!pending) return;
    const decision = pending;
    setStatus.mutate(
      { id: ticket.id, status: decision },
      {
        onSuccess: () => {
          toast.push("ok", `Ticket ${COPY[decision].done}.`);
          setPending(null);
          setReason("");
        },
        onError: () => toast.push("danger", "The action failed. Please try again."),
      },
    );
  }

  const copy = pending ? COPY[pending] : null;

  if (!canReview) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-3 text-[12px] text-[var(--color-muted-foreground)]">
        <span className="mt-0.5 text-[var(--color-subtle)]">
          <AlertIcon size={13} />
        </span>
        {event?.tags.includes("read-only")
          ? "This event is read-only. Choose the Practice Playground to try a review."
          : "This event requires an authorized reviewer. Live demo changes require the Administrator login."}
      </div>
    );
  }

  const bar = layout === "bar";

  const decidedNote = decided && (
    <div
      className={
        bar
          ? "flex w-full items-center gap-1.5 text-[12px] text-[var(--color-muted-foreground)]"
          : "flex items-start gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px] text-[var(--color-muted-foreground)]"
      }
    >
      <span className={bar ? "text-[var(--color-subtle)]" : "mt-0.5 text-[var(--color-subtle)]"}>
        <AlertIcon size={13} />
      </span>
      This ticket already has a decision. A new decision replaces it.
      {practice && (
        <button
          className="ml-auto shrink-0 text-primary underline"
          disabled={busy}
          onClick={() =>
            setStatus.mutate(
              { id: ticket.id, status: "draft" },
              {
                onSuccess: () => {
                  setCall("");
                  setShowCall(false);
                  toast.push("ok", "Practice review reset.");
                },
                onError: () => toast.push("danger", "Could not reset the practice review."),
              },
            )
          }
        >
          Reset practice review
        </button>
      )}
    </div>
  );

  const callLabel = (
    <label
      htmlFor="monitor-call"
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-medium text-[var(--color-muted-foreground)]"
    >
      {bar ? "Inspector call" : "Inspector's fill call"}
      <Tooltip content="The fill percentage the on-site human inspector called for this load. Enter it to compare with Muse Spark's visual estimate.">
        <span tabIndex={0} className="text-[var(--color-subtle)] hover:text-[var(--color-text)]">
          <InfoIcon size={12} />
        </span>
      </Tooltip>
    </label>
  );

  const callInput = (
    <div className={bar ? "relative w-[88px] shrink-0" : "relative flex-1"}>
      <input
        id="monitor-call"
        type="number"
        min={0}
        max={100}
        step={0.1}
        inputMode="decimal"
        aria-invalid={call.trim() !== "" && !callValid}
        aria-describedby={bar ? "monitor-call-help" : undefined}
        value={call}
        onChange={(e) => setCall(e.target.value)}
        className={`w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] pl-3 pr-7 text-[13px] tabular-nums text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none ${bar ? "py-1.5" : "py-2"}`}
        placeholder={bar ? "0-100" : "0 to 100"}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--color-subtle)]">
        %
      </span>
    </div>
  );

  const updateButton = (
    <Button
      type="submit"
      variant="secondary"
      size={bar ? "sm" : "md"}
      className={bar ? "py-1.5" : undefined}
      disabled={busy || !callValid || !callChanged}
    >
      {setMonitorCall.isPending ? "Saving…" : "Save call"}
    </Button>
  );

  const confirmButton = (
    <button
      type="button"
      disabled={busy || unsavedCall}
      onClick={() => setPending("confirmed")}
      className={`group flex items-center justify-between gap-2 rounded-md bg-[var(--color-brand-fill)] text-[13px] font-semibold text-[var(--color-on-accent)] transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ok)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-40 ${bar ? "col-span-2 min-w-0 px-3 py-2 @[44rem]:col-span-1" : "w-full px-4 py-2.5"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <CheckIcon size={16} className="shrink-0" />
        <span className="truncate">Confirm estimate</span>
      </span>
    </button>
  );

  const overrideButton = (
    <Button
      variant="ghost"
      disabled={busy || unsavedCall}
      onClick={() => setPending("overridden")}
      className={bar ? "min-w-0 whitespace-nowrap" : undefined}
    >
      Override {/* Kbd sets its own display, so the wrapper does the hiding. */}
      <span className="ml-1 hidden @[52rem]:inline-flex">
        <Kbd className="border-current/30 bg-transparent text-current">O</Kbd>
      </span>
    </Button>
  );

  const disputeButton = (
    <Button
      variant="ghost"
      disabled={busy || unsavedCall}
      onClick={() => setPending("disputed")}
      className={bar ? "min-w-0 whitespace-nowrap" : undefined}
    >
      Dispute{" "}
      <span className="ml-1 hidden @[52rem]:inline-flex">
        <Kbd className="border-current/30 bg-transparent text-current">D</Kbd>
      </span>
    </Button>
  );

  const dialog = (
    <ConfirmDialog
      open={copy !== null}
      title={copy?.title ?? ""}
      description={copy?.body}
      confirmLabel={copy?.cta}
      confirmVariant={copy?.variant}
      busy={busy}
      reason={needsReason ? { required: true, valid: reasonValid } : undefined}
      onConfirm={confirmAction}
      onCancel={() => {
        setPending(null);
        setReason("");
      }}
    >
      {needsReason && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--color-muted-foreground)]">
            Reason <span className="text-[var(--color-danger)]">*</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="For example: load visibly heaped above the rail on frame 2."
            className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
            autoFocus
          />
          {!reasonValid && (
            <span className="text-[12px] text-[var(--color-subtle)]">
              A short reason is required.
            </span>
          )}
        </label>
      )}
    </ConfirmDialog>
  );

  if (bar) {
    return (
      <div className="flex flex-col gap-3">
        {decidedNote}
        {unsavedCall && (
          <p role="status" className="text-xs text-[var(--warn)]">
            Save or clear the inspector call before recording a decision.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Does the estimate match the footage?</p>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy || unsavedCall}
                  className="min-h-10 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-40"
                >
                  Other decisions
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuItem onSelect={() => setPending("overridden")}>
                  Override ticket
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPending("disputed")}>
                  Dispute ticket
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {confirmButton}
          </div>
        </div>
        <div className="border-t border-border pt-3">
          <button
            type="button"
            aria-expanded={showCall}
            aria-controls="inspector-call-form"
            onClick={() => setShowCall((open) => !open)}
            className="min-h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            {showCall
              ? "Hide inspector call"
              : ticket.valuation.monitor_fill_pct !== null
                ? `Inspector call: ${percent(ticket.valuation.monitor_fill_pct)}`
                : "+ Add an inspector fill call (optional)"}
          </button>
          {showCall && (
            <form
              id="inspector-call-form"
              onSubmit={submitCall}
              className="mt-2 flex flex-wrap items-center gap-3"
            >
              {callLabel}
              {callInput}
              {updateButton}
              <p id="monitor-call-help" className="w-full text-xs text-muted-foreground">
                {call.trim() !== "" && !callValid
                  ? "Enter a percentage between 0 and 100."
                  : "Record the on-site estimate to compare it with the measured fill. Save it separately before confirming."}
              </p>
            </form>
          )}
        </div>
        {dialog}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {decidedNote}

      {/* Monitor call */}
      <form onSubmit={submitCall} className="flex flex-col gap-1.5">
        {callLabel}
        <div className="flex gap-2">
          {callInput}
          {updateButton}
        </div>
      </form>

      {/* Decisions */}
      <div className="flex flex-col gap-2">
        {confirmButton}
        <div className="grid grid-cols-2 gap-2">
          {overrideButton}
          {disputeButton}
        </div>
      </div>

      {dialog}
    </div>
  );
}
