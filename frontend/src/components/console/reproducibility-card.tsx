"use client";

import { useState } from "react";
import { ShieldCheckIcon, PlayIcon } from "lucide-react";

import { api, ApiError, fetchEvidenceMediaUrl, type Reverify, type Ticket } from "@/lib/api";
import { isJudgeMode } from "@/lib/app-mode";
import { CollapsibleSectionCard } from "@/components/console/section-card";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { CheckCircleIcon, AlertIcon } from "@/components/ui/icons";
import { useEventContext } from "@/lib/event-context";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Reproducibility: the proof that a ticket's number can be re-derived from the
 * evidence. "Re-verify" replays the geometry over the stored SAM masks and
 * rebuilds the evidence receipt (a SHA-256 over every pinned input), returning a
 * matching fill % and a matching fingerprint. In judge mode a "Run live" control
 * re-ingests the same clip through the real pipeline, with a "bypass cache"
 * toggle that forces a fresh model call so the run is provably live.
 */
export function ReproducibilityCard({ ticket }: { ticket: Ticket }) {
  const judge = isJudgeMode();
  return (
    <CollapsibleSectionCard
      id="reproducibility"
      title="Reproducibility"
      icon={<ShieldCheckIcon size={15} />}
      summary="Re-derive the fill % from the stored evidence"
      defaultOpen={false}
    >
      <div className="flex flex-col gap-3">
        <ReverifyPanel ticket={ticket} />
        {judge && <RunLivePanel ticket={ticket} />}
      </div>
    </CollapsibleSectionCard>
  );
}

function ReverifyPanel({ ticket }: { ticket: Ticket }) {
  const [state, setState] = useState<"idle" | "running">("idle");
  const [result, setResult] = useState<Reverify | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setState("running");
    setError(null);
    try {
      setResult(await api.reverifyTicket(ticket.id));
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Re-verify failed.");
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] leading-snug text-muted-foreground">
        Recalculate this fill % from the stored video outlines to verify the measurement. Nothing
        is sent to a model; the number is calculated directly from the saved video.
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={run}
        disabled={state === "running"}
      >
        {state === "running" ? "Re-verifying…" : "Re-verify calculation"}
      </Button>
      {error && <p className="text-[12px] text-[var(--color-destructive)]">{error}</p>}
      {result && <ReverifyResult result={result} />}
    </div>
  );
}

function ReverifyResult({ result }: { result: Reverify }) {
  const ok = result.reproducible;
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border px-3 py-2.5"
      style={{
        borderColor: ok ? "var(--color-ok)" : "var(--color-warn)",
        backgroundColor: ok ? "var(--color-ok-soft)" : "var(--color-warn-soft)",
      }}
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]">
        <span style={{ color: ok ? "var(--color-ok)" : "var(--color-warn)" }}>
          {ok ? <CheckCircleIcon size={16} /> : <AlertIcon size={16} />}
        </span>
        {ok ? "Reproduced from evidence" : "Could not reproduce"}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        <dt>Stored fill</dt>
        <dd className="tabular-nums text-foreground">{result.stored_fill_pct}%</dd>
        {result.recomputed_fill_pct !== null && (
          <>
            <dt>Recomputed fill</dt>
            <dd className="tabular-nums text-foreground">{result.recomputed_fill_pct}%</dd>
          </>
        )}
      </dl>
      {result.receipt_hash && (
        <div className="flex flex-col gap-1">
          <Tooltip content="Permanent digital verification code for this video clip, Meta SAM outlines, and calculations. Same footage, same verified result.">
            <span className="w-fit text-[11px] font-medium text-muted-foreground underline decoration-dotted">
              Verification receipt
            </span>
          </Tooltip>
          <code className="block break-all rounded bg-[var(--color-surface-2)] px-2 py-1 font-mono text-[11px] text-foreground">
            {result.receipt_hash}
          </code>
        </div>
      )}
    </div>
  );
}

function RunLivePanel({ ticket }: { ticket: Ticket }) {
  const { selectedId: eventId } = useEventContext();
  const qc = useQueryClient();
  const [bypass, setBypass] = useState(true);
  const [state, setState] = useState<"idle" | "running">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runLive() {
    if (!eventId) return;
    setState("running");
    setError(null);
    setNote(null);
    let objectUrl: string | null = null;
    try {
      objectUrl = await fetchEvidenceMediaUrl(ticket.id);
      const blob = await (await fetch(objectUrl)).blob();
      const file = new File([blob], `relive-${ticket.id}.mp4`, { type: blob.type || "video/mp4" });
      const fresh = await api.ingest(eventId, file, { bypassCache: bypass });
      setNote(
        `Live run complete. Fill ${fresh.valuation.est_fill_pct}%, value $${fresh.valuation.est_dollar_value}.`,
      );
      await qc.invalidateQueries();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("This ticket has no stored clip to re-ingest.");
      } else {
        setError(err instanceof ApiError && err.message ? err.message : "Live run failed.");
      }
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
      <p className="text-[12px] leading-snug text-muted-foreground">
        Re-ingest this exact clip through the full pipeline so you can see the real run, not the
        saved result.
      </p>
      <label className="flex items-center gap-2 text-[12px] text-foreground">
        <input
          type="checkbox"
          checked={bypass}
          onChange={(e) => setBypass(e.target.checked)}
          className="size-4 accent-[var(--color-brand)]"
        />
        Bypass cache (force a fresh model call)
      </label>
      <Button
        type="button"
        size="sm"
        onClick={runLive}
        disabled={state === "running" || !eventId}
        className="gap-1.5"
      >
        <PlayIcon size={14} />
        {state === "running" ? "Running live…" : "Run live"}
      </Button>
      {note && <p className="text-[12px] text-[var(--color-ok)]">{note}</p>}
      {error && <p className="text-[12px] text-[var(--color-destructive)]">{error}</p>}
    </div>
  );
}
