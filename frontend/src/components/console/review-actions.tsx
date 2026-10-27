"use client";

import { useEffect, useState } from "react";

import type { Ticket, TicketStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AlertIcon, CheckIcon, InfoIcon } from "@/components/ui/icons";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
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
    body: "LoadTruth's measurement becomes the ticket of record for this load.",
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
  const { can } = useAuth();
  const canReview = can("review_tickets");
  const setMonitorCall = useSetMonitorCall();
  const setStatus = useSetStatus();

  const [call, setCall] = useState(() => {
    const raw = ticket.valuation.monitor_fill_pct;
    if (raw === null) return "";
    const n = Number.parseFloat(raw);
    return Number.isNaN(n) ? "" : String(Math.round(n * 10) / 10);
  });
  const [pending, setPending] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");

  const busy = setMonitorCall.isPending || setStatus.isPending;
  const needsReason = pending === "overridden" || pending === "disputed";
  const reasonValid = reason.trim().length >= 4;
  const decided = ticket.status !== "draft";

  // Keyboard shortcuts for the three decisions.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        !canReview ||
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
  }, [pending, busy, canReview]);

  function submitCall(e: React.FormEvent) {
    e.preventDefault();
    const pct = call.trim();
    if (pct === "") return;
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
        Your role has read-only access. Reviewing tickets requires monitor access or higher.
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
    </div>
  );

  const callLabel = (
    <label
      htmlFor="monitor-call"
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-medium text-[var(--color-muted-foreground)]"
    >
      {bar ? "Inspector call" : "Inspector's fill call"}
      <Tooltip content="The fill percentage the on-site human inspector called for this load. The contractor is paid on this number. Enter it to see how it compares to what the AI measured.">
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
        step={1}
        inputMode="numeric"
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
      disabled={busy || call.trim() === ""}
    >
      Update
    </Button>
  );

  const confirmButton = (
    <button
      type="button"
      disabled={busy}
      onClick={() => setPending("confirmed")}
      className={`group flex items-center justify-between gap-2 rounded-md bg-[var(--color-ok)] text-[13px] font-semibold text-[var(--color-on-accent)] transition-all hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ok)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-40 ${bar ? "min-w-0 px-3 py-2" : "w-full px-4 py-2.5"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <CheckIcon size={16} className="shrink-0" />
        <span className="truncate">Confirm assessment</span>
      </span>
      <kbd className="hidden shrink-0 rounded bg-black/15 px-1.5 py-0.5 text-[11px] font-medium lg:inline">
        C
      </kbd>
    </button>
  );

  const overrideButton = (
    <Button
      variant="warn"
      disabled={busy}
      onClick={() => setPending("overridden")}
      className={bar ? "min-w-0 whitespace-nowrap" : undefined}
    >
      Override{" "}
      <Kbd className="ml-1 hidden border-current/30 bg-transparent text-current lg:inline-flex">
        O
      </Kbd>
    </Button>
  );

  const disputeButton = (
    <Button
      variant="danger"
      disabled={busy}
      onClick={() => setPending("disputed")}
      className={bar ? "min-w-0 whitespace-nowrap" : undefined}
    >
      Dispute{" "}
      <Kbd className="ml-1 hidden border-current/30 bg-transparent text-current lg:inline-flex">
        D
      </Kbd>
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

  // One row under the evidence: the inspector call on the left, the three
  // decisions on the right. Wraps to two rows when the pane is narrow.
  if (bar) {
    // Sized by its own width (container query): one row when the center pane
    // is wide, two rows when it is narrow. The three decisions share the row in
    // fixed proportions so they can shrink instead of overflowing the bar.
    return (
      <div className="@container">
        <div className="flex flex-col gap-2 @[46rem]:flex-row @[46rem]:items-center @[46rem]:gap-3">
          {decidedNote}
          <form onSubmit={submitCall} className="flex shrink-0 items-center gap-2">
            {callLabel}
            {callInput}
            {updateButton}
          </form>
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
            {confirmButton}
            {overrideButton}
            {disputeButton}
          </div>
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
