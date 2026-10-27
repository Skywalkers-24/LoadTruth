"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckCircle2Icon, Loader2Icon, UploadCloudIcon } from "lucide-react";

import type { Ticket } from "@/lib/api";
import { AppShell } from "@/components/shell/app-shell";
import { shortId } from "@/components/console/ticket-metadata";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useIngest } from "@/lib/hooks";
import { money, signedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Add a Ticket: upload a clip or image of a loaded truck; the pipeline analyzes
 * it and drafts a ticket with a real valuation. Every figure is computed by the
 * backend pipeline from the evidence, never hand-entered.
 */
export default function AddTicketPage() {
  const { selected, selectedId: eventId } = useEventContext();
  const { can } = useAuth();
  const router = useRouter();
  const ingest = useIngest();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allowed = can("ingest");

  function submit(file: File) {
    if (!eventId) return;
    setError(null);
    setResult(null);
    ingest.mutate(
      { eventId, file },
      {
        onSuccess: (t) => setResult(t),
        onError: () =>
          setError("No truck was detected in that file, so no ticket was drafted. Try another clip."),
      },
    );
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) submit(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!allowed) {
    return (
      <AppShell section="Add a Ticket">
        <Card className="mx-auto mt-10 max-w-md p-8 text-center">
          <h1 className="text-[16px] font-semibold">Not available for your role</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Uploading clips requires review access. Ask an admin if you need it.
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell section="Add a Ticket">
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto pb-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[20px] font-semibold tracking-tight">Add a ticket</h1>
          <p className="text-[13px] text-muted-foreground">
            Upload a clip or image of the loaded truck for{" "}
            <span className="font-medium text-foreground">{selected?.name ?? "this event"}</span>. LoadTruth
            measures the fill and drafts a ticket you can review.
          </p>
        </div>

        <Card className="gap-0 p-0">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) submit(file);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragging ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]" : "border-border hover:border-[var(--color-border-strong)]",
              ingest.isPending && "pointer-events-none opacity-70",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/*,image/*"
              onChange={onPick}
              className="hidden"
              disabled={ingest.isPending}
            />
            <span className="grid size-12 place-items-center rounded-full bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
              {ingest.isPending ? <Loader2Icon className="size-6 animate-spin" /> : <UploadCloudIcon className="size-6" />}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[14px] font-semibold">
                {ingest.isPending ? "Analyzing the clip" : "Drop a clip here, or click to browse"}
              </span>
              <span className="text-[12px] text-muted-foreground">
                {ingest.isPending ? "Measuring fill and drafting the ticket" : "Video or image, up to a few hundred MB"}
              </span>
            </div>
          </label>
        </Card>

        {error && (
          <Card className="border-[var(--color-danger)]/40 bg-[var(--color-danger-soft)] p-4">
            <p className="text-[13px] text-[var(--color-danger)]">{error}</p>
          </Card>
        )}

        {result && (
          <Card className="gap-0 border-[var(--color-ok)]/40 p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2Icon className="size-5 text-[var(--color-ok)]" />
              <h2 className="text-[15px] font-semibold">Ticket drafted</h2>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Ticket" value={shortId(result.id)} />
              <Field label="Truck" value={result.truck_id ?? "Unidentified"} />
              <Field label="Measured value" value={money(result.valuation.est_dollar_value)} />
              <Field
                label="Delta"
                value={result.valuation.delta_dollar_value ? signedMoney(result.valuation.delta_dollar_value) : "Not called"}
              />
            </div>
            <Button className="mt-4 self-start" size="sm" onClick={() => router.push(`/console?ticket=${result.id}`)}>
              Open in Review Console
              <ArrowRightIcon />
            </Button>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[14px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}
