"use client";

import { useRef } from "react";
import { DownloadIcon, FileTextIcon, Loader2Icon, UploadIcon } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/shadcn/button";
import { useToast } from "@/components/ui/toast";
import { useIngest } from "@/lib/hooks";

/** Event-level actions: upload clips, export CSV, generate audit packet. */
export function EventActions({
  eventId,
  uploadVariant = "default",
}: {
  eventId: string;
  uploadVariant?: "default" | "secondary";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ingest = useIngest();
  const toast = useToast();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    ingest.mutate(
      { eventId, file },
      {
        onSuccess: (t) =>
          toast.push("ok", `New ticket created for ${t.truck_id ?? "an unidentified truck"}.`),
        onError: () => toast.push("danger", "No truck was detected in that clip. Try another file."),
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
      <Button
        variant={uploadVariant}
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={ingest.isPending}
      >
        {ingest.isPending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
        {ingest.isPending ? "Analyzing clip" : "Upload clip"}
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={api.exportCsvUrl(eventId)}>
          <DownloadIcon />
          Export CSV
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={api.auditPacketUrl(eventId)} target="_blank" rel="noreferrer">
          <FileTextIcon />
          Audit packet
        </a>
      </Button>
    </div>
  );
}
