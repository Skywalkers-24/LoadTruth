"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, Mic, SparklesIcon, Square, X } from "lucide-react";

import type { Ticket, TicketStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AlertIcon, CheckIcon, InfoIcon } from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import {
  useEvents,
  useFileManualMonitorReport,
  useSetStatus,
  useTranscribeMonitorCall,
} from "@/lib/hooks";
import { isTypingTarget } from "@/lib/use-media-query";

/**
 * Human review controls: record the monitor's fill call, then confirm, override,
 * or dispute. Override and dispute require a reason. Keyboard: C confirm,
 * O override, D dispute (ignored while typing).
 */
type Decision = Exclude<TicketStatus, "draft">;

async function toMonoWav(blob: Blob): Promise<Blob> {
  const sourceContext = new AudioContext();
  try {
    const decoded = await sourceContext.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.ceil(decoded.duration * 24000);
    const offline = new OfflineAudioContext(1, frames, 24000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const pcm = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(pcm);
    const write = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    };
    write(0, "RIFF");
    view.setUint32(4, pcm.byteLength - 8, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 24000, true);
    view.setUint32(28, 48000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
      view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Blob([pcm], { type: "audio/wav" });
  } finally {
    await sourceContext.close();
  }
}

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
  const canUseMicrophone = member?.role === "super_admin";
  const canReview = Boolean(
    event &&
    !event.tags.includes("read-only") &&
    (!event.tags.includes("admin-only") || member?.role === "super_admin") &&
    (event.tags.includes("playground") || can("review_tickets")),
  );
  const fileManualReport = useFileManualMonitorReport();
  const transcribeCall = useTranscribeMonitorCall();
  const setStatus = useSetStatus();

  const [call, setCall] = useState(() => {
    const raw = ticket.valuation.monitor_fill_pct;
    if (raw === null) return "";
    const n = Number.parseFloat(raw);
    return Number.isNaN(n) ? "" : String(Math.round(n * 10) / 10);
  });
  const [showManualFiling, setShowManualFiling] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [issueDescription, setIssueDescription] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceFlags, setVoiceFlags] = useState<string[]>([]);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [audioError, setAudioError] = useState("");
  const [voiceOutcome, setVoiceOutcome] = useState<{
    tone: "ok" | "warn";
    message: string;
  } | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordTimer = useRef<number | null>(null);
  const recordingTicketId = useRef(ticket.id);
  const discardRecording = useRef(false);
  const [pending, setPending] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");

  const practice = event?.tags.includes("playground");
  const busy = fileManualReport.isPending || setStatus.isPending || transcribing || recording;
  const reasonValid = reason.trim().length >= 4;
  const decided = ticket.status !== "draft";
  const callNumber = Number(call);
  const callValid =
    call.trim() !== "" && Number.isFinite(callNumber) && callNumber >= 0 && callNumber <= 100;
  const callChanged =
    ticket.valuation.monitor_fill_pct === null ||
    callNumber !== Number(ticket.valuation.monitor_fill_pct);

  const fillEntered = call.trim() !== "";
  const issueEntered = issueDescription.trim() !== "";
  const issueValid = issueDescription.trim().length >= 4 && issueDescription.trim().length <= 512;
  const hasManualChange = (fillEntered && callChanged) || issueEntered;
  const manualValid =
    (!fillEntered || callValid) && (!issueEntered || issueValid) && hasManualChange;
  const unsavedCall = (fillEntered && callChanged) || issueEntered;

  // Keyboard shortcuts for the three decisions.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        layout !== "bar" ||
        !canReview ||
        recording ||
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
  }, [pending, busy, canReview, unsavedCall, recording, layout]);

  useEffect(
    () => () => {
      discardRecording.current = true;
      if (recordTimer.current !== null) window.clearTimeout(recordTimer.current);
      if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
    },
    [ticket.id],
  );

  function submitManualFiling(e: React.FormEvent) {
    e.preventDefault();
    if (!manualValid) return;
    fileManualReport.mutate(
      {
        id: ticket.id,
        monitor_fill_pct: fillEntered && callChanged ? call.trim() : undefined,
        issue_description: issueEntered ? issueDescription.trim() : undefined,
      },
      {
        onSuccess: (updated) => {
          if (updated.valuation.monitor_fill_pct !== null) {
            setCall(String(Number(updated.valuation.monitor_fill_pct)));
          }
          setIssueDescription("");
          setShowManualFiling(false);
          setVoiceOutcome({ tone: "ok", message: "Monitor report saved." });
          toast.push("ok", "Manual filing added to this ticket for review.");
        },
        onError: () => toast.push("danger", "Could not file this monitor report."),
      },
    );
  }

  async function startMonitorRecording() {
    setAudioError("");
    setFollowUpQuestion("");
    setVoiceOutcome(null);
    discardRecording.current = false;
    recordingTicketId.current = ticket.id;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAudioError("Microphone recording isn’t supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mediaRecorder.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordTimer.current !== null) window.clearTimeout(recordTimer.current);
        if (discardRecording.current) return;
        setRecording(false);
        setTranscribing(true);
        try {
          const wav = await toMonoWav(new Blob(chunks, { type: recorder.mimeType }));
          const result = await transcribeCall.mutateAsync({
            id: recordingTicketId.current,
            audio: wav,
            context: transcript,
          });
          setTranscript((previous) =>
            previous ? `${previous} ${result.transcript}` : result.transcript,
          );
          setVoiceFlags(result.issue_flags);
          if (result.issue_flags.length > 0) {
            setReason(result.issue_flags.join(" · "));
          }
          setFollowUpQuestion(result.follow_up_question ?? "");
          if (result.saved_fill_pct !== null) setCall(String(result.saved_fill_pct));
          if (result.saved_fill_pct !== null || result.issue_flags.length > 0) {
            const updates = [
              result.saved_fill_pct !== null ? `${result.saved_fill_pct}% fill` : null,
              result.issue_flags.length
                ? `${result.issue_flags.length} review flag${result.issue_flags.length === 1 ? "" : "s"}`
                : null,
            ].filter(Boolean);
            setVoiceOutcome({ tone: "ok", message: `Voice report saved · ${updates.join(" · ")}` });
            toast.push(
              "ok",
              `Voice update applied${result.issue_flags.length ? `, ${result.issue_flags.length} review flag${result.issue_flags.length === 1 ? "" : "s"} added` : ""}.`,
            );
          }
          if (
            result.saved_fill_pct === null &&
            !result.issue_flags.length &&
            !result.follow_up_question
          ) {
            setAudioError("No clear fill call or issue. Try again or file manually.");
          } else if (
            result.saved_fill_pct === null &&
            !result.issue_flags.length &&
            result.follow_up_question
          ) {
            setVoiceOutcome({ tone: "warn", message: "More detail needed before the report can be saved." });
          }
        } catch {
          setAudioError("Transcription failed. Retry or file manually.");
          setVoiceOutcome(null);
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setRecording(true);
      recordTimer.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, 15_000);
    } catch {
      setAudioError("Microphone access unavailable. Check browser permissions.");
      setRecording(false);
    }
  }

  function stopMonitorRecording() {
    if (recordTimer.current !== null) window.clearTimeout(recordTimer.current);
    if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
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

  async function raiseDispute() {
    const note = reason.trim();
    if (!callValid || note.length < 4) return;
    try {
      // Persist the disputed percentage and explanation together so voice and
      // manual filing produce the same durable ticket record.
      await fileManualReport.mutateAsync({
        id: ticket.id,
        monitor_fill_pct: call.trim(),
        issue_description: note,
      });
      await setStatus.mutateAsync({ id: ticket.id, status: "disputed" });
      setReason("");
      setVoiceOutcome({ tone: "ok", message: "Dispute raised and report saved." });
      toast.push("ok", ticket.status === "disputed" ? "Dispute re-raised." : "Dispute raised.");
    } catch {
      toast.push("danger", "Could not raise this dispute. Please try again.");
    }
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
                  setShowManualFiling(false);
                  setIssueDescription("");
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
      Inspector fill call (%)
      <Tooltip content="The fill percentage the on-site inspector recorded. Enter it to compare with the video estimate.">
        <span tabIndex={0} className="text-[var(--color-subtle)] hover:text-[var(--color-text)]">
          <InfoIcon size={12} />
        </span>
      </Tooltip>
    </label>
  );

  const callInput = (
    <div className="relative w-full">
      <input
        id="monitor-call"
        type="number"
        min={0}
        max={100}
        step={0.1}
        inputMode="decimal"
        aria-invalid={call.trim() !== "" && !callValid}
        aria-describedby={fillEntered && !callValid ? "monitor-call-help" : undefined}
        value={call}
        onChange={(e) => setCall(e.target.value)}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] tabular-nums text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
        placeholder="Optional, 0–100"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--color-subtle)]">
        %
      </span>
    </div>
  );

  const monitorReportPanel = (
    <div className="border-t border-border pt-3">
      <div className="flex flex-col gap-2.5">
        <div>
          <p className="text-sm font-medium">Voice report</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Say the fill percentage, then any issue and where it appears. Up to 15 seconds.
          </p>
        </div>
        <Tooltip
          content={
            canUseMicrophone
              ? "Say the fill percentage, issue, and location. Up to 15 seconds."
              : "Voice filing is available in Administrator mode."
          }
        >
          <Button
            type="button"
            variant={recording ? "danger" : "primary"}
            className="self-start"
            icon={
              transcribing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : recording ? (
                <Square className="size-4" />
              ) : (
                <Mic className="size-4" />
              )
            }
            disabled={
              recording
                ? false
                : !canUseMicrophone || busy || (showManualFiling && hasManualChange)
            }
            onClick={recording ? stopMonitorRecording : startMonitorRecording}
            aria-label={recording ? "Stop recording" : "Talk to file a monitor report"}
          >
            {transcribing ? "Transcribing…" : recording ? "Stop recording" : "Talk"}
          </Button>
        </Tooltip>
        {!canUseMicrophone && !recording && (
          <p className="text-[11px] leading-tight text-muted-foreground">
            Microphone transcription is available in Administrator mode. You can file the report
            manually.
          </p>
        )}
        {recording && (
          <div
            role="status"
            aria-live="polite"
            className="inline-flex min-h-6 items-center gap-2 text-xs font-medium text-[var(--color-danger)]"
          >
            <span className="size-2 rounded-full bg-[var(--color-danger)] motion-safe:animate-pulse" />
            <span>Listening… speak now</span>
            <span aria-hidden="true" className="inline-flex h-4 items-center gap-0.5">
              <span className="h-1.5 w-0.5 rounded-full bg-current motion-safe:animate-pulse" />
              <span className="h-3 w-0.5 rounded-full bg-current motion-safe:animate-pulse [animation-delay:120ms]" />
              <span className="h-2 w-0.5 rounded-full bg-current motion-safe:animate-pulse [animation-delay:240ms]" />
              <span className="h-3.5 w-0.5 rounded-full bg-current motion-safe:animate-pulse [animation-delay:360ms]" />
            </span>
          </div>
        )}
        {transcript && <p className="text-xs text-muted-foreground">Transcript: “{transcript}”</p>}
        {voiceFlags.length > 0 && (
          <p className="text-xs text-[var(--color-warn)]">
            Added to Flags to review: {voiceFlags.join(" · ")}
          </p>
        )}
        {followUpQuestion && (
          <p role="status" className="text-xs text-[var(--color-accent)]">
            AI asks: “{followUpQuestion}” Record the monitor’s answer to add detail.
          </p>
        )}
        {audioError && (
          <p
            role="status"
            aria-live="polite"
            className="text-[11px] leading-tight text-[var(--warn)]"
          >
            {audioError}
          </p>
        )}
      </div>

      <div className="mt-3 border-t border-border/70 pt-2">
        <div className="flex min-h-8 items-center justify-between gap-3">
          {showManualFiling ? (
            <p className="text-xs font-medium text-foreground">Manual filing</p>
          ) : (
            <button
              type="button"
              aria-expanded={false}
              aria-controls="manual-monitor-filing"
              onClick={() => setShowManualFiling(true)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Manual filing
            </button>
          )}
          {showManualFiling && (
            <button
              type="button"
              aria-label="Close manual filing"
              aria-expanded={true}
              aria-controls="manual-monitor-filing"
              onClick={() => setShowManualFiling(false)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-3.5" />
              Close
            </button>
          )}
        </div>
        {showManualFiling && (
          <form
            id="manual-monitor-filing"
            onSubmit={submitManualFiling}
            className="mt-2 flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1.5">
              {callLabel}
              {callInput}
              {fillEntered && !callValid && (
                <p id="monitor-call-help" className="text-xs text-[var(--color-danger)]">
                  Enter a percentage between 0 and 100.
                </p>
              )}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--color-muted-foreground)]">
                Issue to flag
              </span>
              <textarea
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                rows={3}
                maxLength={512}
                aria-invalid={issueEntered && !issueValid}
                placeholder="Describe the issue and location, such as a dip at the rear left edge."
                className="w-full resize-y rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              />
              {issueEntered && !issueValid && (
                <span className="text-xs text-[var(--color-danger)]">
                  Enter at least 4 characters.
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                Filed items appear under Flags to review and do not decide the ticket.
              </span>
            </label>
            <Button type="submit" variant="primary" disabled={busy || !manualValid}>
              {fileManualReport.isPending ? "Filing…" : "File ticket"}
            </Button>
          </form>
        )}
      </div>
    </div>
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

  const closeDecision = () => {
    setPending(null);
    setReason("");
  };

  const dialog = pending === "overridden" || pending === "disputed" ? (
    <DecisionDrawer
      decision={pending}
      ticket={ticket}
      reason={reason}
      reasonValid={reasonValid}
      busy={busy}
      onReasonChange={setReason}
      onConfirm={confirmAction}
      onClose={closeDecision}
    />
  ) : (
    <ConfirmDialog
      open={pending === "confirmed"}
      title={copy?.title ?? ""}
      description={copy?.body}
      confirmLabel={copy?.cta}
      confirmVariant={copy?.variant}
      busy={busy}
      onConfirm={confirmAction}
      onCancel={closeDecision}
    />
  );

  if (bar) {
    return (
      <div className="flex flex-col gap-2">
        {decidedNote}
        {unsavedCall && (
          <p role="status" className="text-xs text-[var(--warn)]">
            File or clear the manual report before recording a decision.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto min-w-[15rem] flex-1 text-sm font-medium">
            Does the estimate match the footage?
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={busy || unsavedCall}
                className="min-h-9 shrink-0 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-40"
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
          <Tooltip
            content={
              canUseMicrophone
                ? "Say the fill percentage, issue, and location. Up to 15 seconds."
                : "Voice filing is available in Administrator mode."
            }
          >
            <Button
              type="button"
              variant={recording ? "danger" : "primary"}
              className="shrink-0"
              icon={
                transcribing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : recording ? (
                  <Square className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )
              }
              disabled={
                recording
                  ? false
                  : !canUseMicrophone || busy || (showManualFiling && hasManualChange)
              }
              onClick={recording ? stopMonitorRecording : startMonitorRecording}
              aria-label={recording ? "Stop recording" : "Talk to file a monitor report"}
            >
              {transcribing ? "Transcribing…" : recording ? "Stop" : "Talk"}
            </Button>
          </Tooltip>
          <Button
            type="button"
            variant="ghost"
            className="shrink-0"
            aria-expanded={showManualFiling}
            aria-controls="manual-monitor-filing"
            onClick={() => setShowManualFiling((open) => !open)}
            icon={showManualFiling ? <X className="size-4" /> : undefined}
          >
            {showManualFiling ? "Close filing" : "Manual filing"}
          </Button>
        </div>

        {recording && (
          <div role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-danger)]">
            <span className="size-2 rounded-full bg-[var(--color-danger)] motion-safe:animate-pulse" />
            Listening… speak now
          </div>
        )}
        {transcribing && (
          <div role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs font-medium text-[var(--color-accent)]">
            <Loader2 className="size-3.5 animate-spin" />
            Processing voice report…
          </div>
        )}
        {voiceOutcome && !recording && !transcribing && (
          <p
            role="status"
            aria-live="polite"
            className={
              voiceOutcome.tone === "ok"
                ? "text-xs font-medium text-[var(--color-ok)]"
                : "text-xs font-medium text-[var(--color-warn)]"
            }
          >
            {voiceOutcome.message}
          </p>
        )}
        {!canUseMicrophone && !recording && (
          <p className="text-[11px] leading-tight text-muted-foreground">
            Voice filing requires Administrator mode. Manual filing remains available.
          </p>
        )}
        {transcript && <p className="text-xs text-muted-foreground">Transcript: “{transcript}”</p>}
        {voiceFlags.length > 0 && (
          <p className="text-xs text-[var(--color-warn)]">
            Added to Flags to review: {voiceFlags.join(" · ")}
          </p>
        )}
        {followUpQuestion && (
          <p role="status" className="text-xs text-[var(--color-accent)]">
            AI asks: “{followUpQuestion}” Record the monitor’s answer to add detail.
          </p>
        )}
        {audioError && (
          <p role="status" aria-live="polite" className="text-[11px] leading-tight text-[var(--warn)]">
            {audioError}
          </p>
        )}

        {showManualFiling && (
          <form
            id="manual-monitor-filing"
            onSubmit={submitManualFiling}
            className="grid items-end gap-3 border-t border-border pt-3 @[44rem]:grid-cols-[10rem_minmax(0,1fr)_auto]"
          >
            <div className="flex flex-col gap-1.5">
              {callLabel}
              {callInput}
              {fillEntered && !callValid && (
                <p id="monitor-call-help" className="text-xs text-[var(--color-danger)]">
                  Enter 0–100.
                </p>
              )}
            </div>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-medium text-[var(--color-muted-foreground)]">
                Issue to flag
              </span>
              <input
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                maxLength={512}
                aria-invalid={issueEntered && !issueValid}
                placeholder="Describe the issue and where it appears"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            <Button type="submit" variant="primary" disabled={busy || !manualValid}>
              {fileManualReport.isPending ? "Filing…" : "File ticket"}
            </Button>
          </form>
        )}
        {dialog}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setReportDialogOpen(true)}
        className="group flex w-full items-center gap-3 rounded-lg text-left outline-none transition-colors hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--color-warn-soft)] text-[var(--color-warn)]">
          <SparklesIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            {ticket.status === "disputed" ? "Review dispute" : "Raise a dispute"}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {ticket.status === "disputed"
              ? "Open dispute · add another report"
              : "Flag an issue with this ticket"}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>

      {voiceOutcome && (
        <p
          className={
            voiceOutcome.tone === "ok"
              ? "text-[11px] font-medium text-[var(--color-ok)]"
              : "text-[11px] font-medium text-[var(--color-warn)]"
          }
        >
          {voiceOutcome.message}
        </p>
      )}
      {audioError && <p className="text-[11px] text-[var(--color-warn)]">{audioError}</p>}

      <DisputeDrawer
        open={reportDialogOpen}
        ticket={ticket}
        call={call}
        callValid={callValid}
        reason={reason}
        reasonValid={reasonValid}
        busy={busy}
        canUseMicrophone={canUseMicrophone}
        recording={recording}
        transcribing={transcribing}
        transcript={transcript}
        followUpQuestion={followUpQuestion}
        audioError={audioError}
        voiceOutcome={voiceOutcome}
        onCallChange={setCall}
        onReasonChange={setReason}
        onToggleRecording={recording ? stopMonitorRecording : startMonitorRecording}
        onRaise={raiseDispute}
        onClose={() => {
          if (recording) stopMonitorRecording();
          setReportDialogOpen(false);
        }}
      />
    </div>
  );
}

function DecisionDrawer({
  decision,
  ticket,
  reason,
  reasonValid,
  busy,
  onReasonChange,
  onConfirm,
  onClose,
}: {
  decision: "overridden" | "disputed";
  ticket: Ticket;
  reason: string;
  reasonValid: boolean;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const config = COPY[decision];

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && reasonValid && !busy) {
        event.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onClose, onConfirm, reasonValid]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label={config.title}>
      <button
        type="button"
        aria-label="Close decision panel"
        className="fixed inset-0 cursor-default bg-black/45 backdrop-blur-xs"
        onClick={() => !busy && onClose()}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-screen flex-col border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-300 sm:w-[480px] lg:w-[38vw] lg:min-w-[360px] lg:max-w-[620px]">
        <header className="flex items-start justify-between gap-3 border-b border-border bg-card/60 p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ticket decision
            </p>
            <h2 className="mt-1 text-lg font-bold tracking-tight">{config.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{config.body}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close decision panel"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="lt-scroll min-h-0 flex-1 overflow-y-auto p-5">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Truck</p>
                <p className="mt-0.5 font-semibold tabular-nums">{ticket.truck_id ?? "Unidentified"}</p>
              </div>
              <StatusBadge status={ticket.status} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Measured fill</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{ticket.valuation.est_fill_pct}%</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Review flags</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{ticket.anomaly_count}</dd>
              </div>
            </dl>
          </section>

          <label className="mt-5 flex flex-col gap-2">
            <span className="text-sm font-semibold">
              Audit reason <span className="text-[var(--color-danger)]">*</span>
            </span>
            <textarea
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              rows={6}
              placeholder={
                decision === "disputed"
                  ? "Describe why this ticket requires contractor resolution."
                  : "Describe why the saved estimate should be replaced."
              }
              className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              autoFocus
            />
            <span className={reasonValid ? "text-xs text-muted-foreground" : "text-xs text-[var(--color-warn)]"}>
              {reasonValid ? "This reason will be saved in the audit trail." : "Enter at least 4 characters."}
            </span>
          </label>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-card/60 p-4">
          <span className="text-xs text-muted-foreground">Ctrl/⌘ + Enter to submit</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button
              variant={config.variant}
              onClick={onConfirm}
              disabled={busy || !reasonValid}
            >
              {busy ? "Saving…" : config.cta}
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

function DisputeDrawer({
  open,
  onClose,
  ticket,
  call,
  callValid,
  reason,
  reasonValid,
  busy,
  canUseMicrophone,
  recording,
  transcribing,
  transcript,
  followUpQuestion,
  audioError,
  voiceOutcome,
  onCallChange,
  onReasonChange,
  onToggleRecording,
  onRaise,
}: {
  open: boolean;
  onClose: () => void;
  ticket: Ticket;
  call: string;
  callValid: boolean;
  reason: string;
  reasonValid: boolean;
  busy: boolean;
  canUseMicrophone: boolean;
  recording: boolean;
  transcribing: boolean;
  transcript: string;
  followUpQuestion: string;
  audioError: string;
  voiceOutcome: { tone: "ok" | "warn"; message: string } | null;
  onCallChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onToggleRecording: () => void;
  onRaise: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const reports = ticket.anomalies?.filter((item) => item.type === "monitor_call") ?? [];
  const latestReport = reports.at(-1);
  const savedFill = ticket.valuation.monitor_fill_pct;
  const disputeValid = callValid && reasonValid;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label="Ticket dispute">
      <button
        type="button"
        aria-label="Close dispute panel"
        className="fixed inset-0 cursor-default bg-black/45 backdrop-blur-xs"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-screen flex-col border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-300 sm:w-[480px] lg:w-[38vw] lg:min-w-[360px] lg:max-w-[620px]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card/60 p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <SparklesIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight">
                {ticket.status === "disputed" ? "Review dispute" : "Raise a dispute"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the disputed fill percentage and the reason.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dispute panel"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="lt-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 p-5">
            {(ticket.status === "disputed" || latestReport) && (
              <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">Open dispute</p>
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                    Saved
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Fill percentage</dt>
                  <dd className="font-semibold tabular-nums">
                    {savedFill === null ? "Not provided" : `${Number(savedFill)}%`}
                  </dd>
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd className="leading-5">{latestReport?.explanation ?? "No reason saved"}</dd>
                </dl>
              </section>
            )}

            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {ticket.status === "disputed" ? "Update dispute" : "Dispute details"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Speak both values or enter them below.
                  </p>
                </div>
                <Tooltip
                  content={
                    canUseMicrophone
                      ? "Say the fill percentage and the reason for the dispute."
                      : "AI voice is available in Administrator mode."
                  }
                >
                  <Button
                    type="button"
                    size="sm"
                    variant={recording ? "danger" : "primary"}
                    icon={
                      transcribing ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : recording ? (
                        <Square className="size-4" />
                      ) : (
                        <Mic className="size-4" />
                      )
                    }
                    disabled={recording ? false : !canUseMicrophone || busy}
                    onClick={onToggleRecording}
                  >
                    {transcribing ? "Transcribing…" : recording ? "Stop" : "AI voice"}
                  </Button>
                </Tooltip>
              </div>

              {recording && (
                <p className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-[var(--color-danger)]">
                  <span className="size-2 rounded-full bg-current motion-safe:animate-pulse" />
                  Listening… say the percentage and reason
                </p>
              )}
              {voiceOutcome && !recording && !transcribing && (
                <p className="mt-3 text-xs font-medium text-[var(--color-ok)]">
                  {voiceOutcome.message}
                </p>
              )}
              {transcript && (
                <p className="mt-3 rounded-lg bg-secondary/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  “{transcript}”
                </p>
              )}
              {followUpQuestion && (
                <p className="mt-2 text-xs text-primary">{followUpQuestion}</p>
              )}
              {audioError && (
                <p className="mt-2 text-xs text-[var(--color-danger)]">{audioError}</p>
              )}

              <div className="mt-4 grid gap-4">
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Disputed fill percentage
                  </span>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      inputMode="decimal"
                      value={call}
                      onChange={(event) => onCallChange(event.target.value)}
                      placeholder="0–100"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-9 text-sm tabular-nums focus:border-primary focus:outline-none"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                  {call !== "" && !callValid && (
                    <span className="text-xs text-[var(--color-danger)]">Enter 0–100.</span>
                  )}
                </label>

                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Reason</span>
                  <textarea
                    value={reason}
                    onChange={(event) => onReasonChange(event.target.value)}
                    rows={4}
                    maxLength={512}
                    placeholder="Explain why this fill estimate is disputed."
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                  />
                  {reason !== "" && !reasonValid && (
                    <span className="text-xs text-[var(--color-danger)]">Enter at least 4 characters.</span>
                  )}
                </label>
              </div>

              <Button
                className="mt-4 w-full"
                variant="danger"
                disabled={busy || !disputeValid}
                onClick={onRaise}
              >
                {busy
                  ? "Saving…"
                  : ticket.status === "disputed"
                    ? "Update dispute"
                    : "Raise dispute"}
              </Button>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}
