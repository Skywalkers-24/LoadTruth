"use client";

import { useRef, useState } from "react";

import { api } from "@/lib/api";
import { useIngest } from "@/lib/hooks";

/**
 * Upload a clip/image to an event. The backend runs the full pipeline and drafts
 * a ticket, which appears in the queue. Also exposes the event's CSV and audit-
 * packet exports (PLAN.md §3.4).
 */
export function ClipUploader({ eventId }: { eventId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ingest = useIngest();
  const [note, setNote] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setNote(null);
    ingest.mutate(
      { eventId, file },
      {
        onSuccess: (t) => setNote(`Drafted ticket for ${t.truck_id ?? "unidentified truck"}.`),
        onError: () => setNote("No truck detected, or the upload was rejected."),
        onSettled: () => {
          if (inputRef.current) inputRef.current.value = "";
        },
      },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*"
        onChange={onPick}
        className="hidden"
        aria-label="Upload clip"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={ingest.isPending}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
      >
        {ingest.isPending ? "Processing…" : "Upload clip"}
      </button>
      <a
        href={api.exportCsvUrl(eventId)}
        className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]"
      >
        Export CSV
      </a>
      <a
        href={api.auditPacketUrl(eventId)}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]"
      >
        Audit packet
      </a>
      {note && <span className="text-xs text-[var(--color-muted)]">{note}</span>}
    </div>
  );
}
