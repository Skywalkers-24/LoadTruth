"use client";

import { useRef } from "react";

import { api } from "@/lib/api";
import { Button, LinkButton } from "@/components/ui/button";
import { DownloadIcon, FileIcon, UploadIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { useIngest } from "@/lib/hooks";

/** Event-level actions: upload clips, export CSV, generate audit packet. */
export function EventActions({
  eventId,
  uploadVariant = "primary",
}: {
  eventId: string;
  uploadVariant?: "primary" | "secondary";
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
        icon={<UploadIcon size={15} />}
        onClick={() => inputRef.current?.click()}
        disabled={ingest.isPending}
      >
        {ingest.isPending ? "Analyzing clip…" : "Upload clip"}
      </Button>
      <LinkButton href={api.exportCsvUrl(eventId)} icon={<DownloadIcon size={15} />}>
        Export CSV
      </LinkButton>
      <LinkButton href={api.auditPacketUrl(eventId)} icon={<FileIcon size={15} />} external>
        Audit packet
      </LinkButton>
    </div>
  );
}
