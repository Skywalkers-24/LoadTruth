"use client";

import { useState } from "react";

import type { Ticket, TicketStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CheckIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { useSetMonitorCall, useSetStatus } from "@/lib/hooks";
import { percent } from "@/lib/format";

/**
 * Human review controls: enter the monitor's fill-% call, then confirm /
 * override / dispute. Override and dispute require a reason and an explicit
 * confirmation. The backend status endpoint accepts only the new status, so the
 * reason is surfaced to the operator (and in the toast) rather than claimed to
 * be persisted server-side.
 */
type Pending = Exclude<TicketStatus, "draft"> | null;

export function ReviewActions({ ticket }: { ticket: Ticket }) {
  const toast = useToast();
  const setMonitorCall = useSetMonitorCall();
  const setStatus = useSetStatus();

  const [call, setCall] = useState(ticket.valuation.monitor_fill_pct ?? "");
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");

  const busy = setMonitorCall.isPending || setStatus.isPending;
  const needsReason = pending === "overridden" || pending === "disputed";
  const reasonValid = reason.trim().length >= 4;

  function submitCall(e: React.FormEvent) {
    e.preventDefault();
    const pct = call.trim();
    if (pct === "") return;
    setMonitorCall.mutate(
      { id: ticket.id, pct },
      {
        onSuccess: () => toast.push("ok", `Recorded monitor call of ${percent(pct)}.`),
        onError: () => toast.push("danger", "Couldn’t record the monitor call."),
      },
    );
  }

  function confirmAction() {
    if (!pending) return;
    setStatus.mutate(
      { id: ticket.id, status: pending },
      {
        onSuccess: () => {
          const verb =
            pending === "confirmed"
              ? "confirmed"
              : pending === "overridden"
                ? "overridden"
                : "disputed";
          toast.push(
            "ok",
            `Ticket ${verb}${needsReason && reason.trim() ? `. ${reason.trim()}` : ""}.`,
          );
          setPending(null);
          setReason("");
        },
        onError: () => toast.push("danger", "The action failed. Please retry."),
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Monitor call input */}
      <form onSubmit={submitCall} className="flex flex-col gap-1.5">
        <label htmlFor="monitor-call" className="text-[12px] font-medium text-[var(--color-muted)]">
          Monitor’s fill-% call
        </label>
        <div className="flex gap-2">
          <input
            id="monitor-call"
            type="number"
            min={0}
            max={100}
            step={1}
            inputMode="numeric"
            value={call}
            onChange={(e) => setCall(e.target.value)}
            className="w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] tabular-nums text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
            placeholder="%"
          />
          <Button type="submit" variant="primary" disabled={busy || call.trim() === ""}>
            Compare
          </Button>
        </div>
      </form>

      {/* Decision buttons — Confirm is the dominant primary action */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setPending("confirmed")}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-ok)] px-4 py-2.5 text-[13px] font-semibold text-[var(--color-on-accent)] transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ok)]"
        >
          <CheckIcon size={16} />
          Confirm assessment
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="warn" disabled={busy} onClick={() => setPending("overridden")}>
            Override…
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => setPending("disputed")}>
            Dispute
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-[var(--color-subtle)]">
        Actions are enforced by the backend. Role permissions apply server-side.
      </p>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending === "confirmed"
            ? "Confirm this ticket?"
            : pending === "overridden"
              ? "Override this ticket?"
              : "Dispute this ticket?"
        }
        description={
          pending === "confirmed"
            ? "Confirming accepts LoadTruth’s measurement for this load as the ticket of record."
            : pending === "overridden"
              ? "Overriding marks the ticket as manually adjusted. Provide a reason for the audit trail."
              : "Disputing flags the ticket for resolution. Provide a reason for the audit trail."
        }
        confirmLabel={
          pending === "confirmed" ? "Confirm" : pending === "overridden" ? "Override" : "Dispute"
        }
        confirmVariant={
          pending === "confirmed" ? "ok" : pending === "overridden" ? "warn" : "danger"
        }
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
            <span className="text-[12px] font-medium text-[var(--color-muted)]">
              Reason <span className="text-[var(--color-danger)]">*</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain the adjustment or dispute…"
              className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              autoFocus
            />
            {!reasonValid && (
              <span className="text-[11px] text-[var(--color-subtle)]">
                A short reason is required for this action.
              </span>
            )}
          </label>
        )}
      </ConfirmDialog>
    </div>
  );
}
