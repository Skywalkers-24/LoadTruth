"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, X } from "lucide-react";

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
  const [issueDescription, setIssueDescription] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceFlags, setVoiceFlags] = useState<string[]>([]);
  const [followUpQuestion, setFollowUpQuestion] = useState("");
  const [audioError, setAudioError] = useState("");
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordTimer = useRef<number | null>(null);
  const recordingTicketId = useRef(ticket.id);
  const discardRecording = useRef(false);
  const [pending, setPending] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");

  const practice = event?.tags.includes("playground");
  const busy = fileManualReport.isPending || setStatus.isPending || transcribing || recording;
  const needsReason = pending === "overridden" || pending === "disputed";
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
  }, [pending, busy, canReview, unsavedCall, recording]);

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
          toast.push("ok", "Manual filing added to this ticket for review.");
        },
        onError: () => toast.push("danger", "Could not file this monitor report."),
      },
    );
  }

  async function startMonitorRecording() {
    setAudioError("");
    setFollowUpQuestion("");
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
          setFollowUpQuestion(result.follow_up_question ?? "");
          if (result.saved_fill_pct !== null) setCall(String(result.saved_fill_pct));
          if (result.saved_fill_pct !== null || result.issue_flags.length > 0) {
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
          }
        } catch {
          setAudioError("Transcription failed. Retry or file manually.");
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
          <p className="text-sm font-medium">Monitor report</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Say the fill percentage, then any issue and where it appears. Up to 15 seconds.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
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
            (!canUseMicrophone && !recording) ||
            (busy && !recording) ||
            (showManualFiling && hasManualChange)
          }
          onClick={recording ? stopMonitorRecording : startMonitorRecording}
          title={
            canUseMicrophone ? "Record a monitor call" : "Available in Administrator mode only"
          }
          aria-label={recording ? "Stop recording" : "Talk to file a monitor report"}
        >
          {transcribing ? "Transcribing…" : recording ? "Stop recording" : "Talk"}
        </Button>
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
            File or clear the manual report before recording a decision.
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
        {monitorReportPanel}
        {dialog}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {decidedNote}

      {monitorReportPanel}

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
