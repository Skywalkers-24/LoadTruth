"use client";

import { useState } from "react";
import { FileTextIcon, PrinterIcon } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { BillingPanel } from "@/components/billing/billing-panel";
import { Button } from "@/components/ui/shadcn/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { openAuthedExport } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useBilling } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Scope = "event" | "all";

/** Billing: what the county owes the contractor, per event or combined, with invoice export. */
export default function BillingPage() {
  const { selected, selectedId: eventId, isError: eventsError } = useEventContext();
  const { can } = useAuth();
  const canAll = can("manage_events");
  const [scope, setScope] = useState<Scope>("event");
  const allMode = canAll && scope === "all";

  const billing = useBilling(allMode ? undefined : eventId, allMode || Boolean(eventId));

  const invoicePath = allMode
    ? "/billing/invoice.html"
    : eventId
      ? `/events/${eventId}/invoice.html`
      : undefined;
  const openInvoice = () => {
    if (invoicePath) void openAuthedExport(invoicePath);
  };

  return (
    <AppShell section="Billing">
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h1 className="lt-page-title truncate">
              {allMode ? "All events" : (selected?.name ?? "Billing")}
            </h1>
            <p className="truncate text-[12px] text-muted-foreground">
              What the county owes the contractor, with invoice detail and export.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canAll && (
              <div className="flex rounded-lg border border-border p-0.5">
                {(["event", "all"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                      scope === s
                        ? "bg-[var(--color-brand-fill)] text-white"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s === "event" ? "This event" : "All events"}
                  </button>
                ))}
              </div>
            )}
            {invoicePath && (
              <>
                <Button variant="outline" size="sm" onClick={openInvoice}>
                  <FileTextIcon />
                  Invoice
                </Button>
                <Button size="sm" onClick={openInvoice}>
                  <PrinterIcon />
                  Print / PDF
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="lt-scroll lt-fab-safe min-h-0 flex-1 overflow-y-auto pr-1">
          {eventsError ? (
            <ErrorState
              title="Events unavailable"
              description="The server did not return any events."
            />
          ) : billing.isLoading ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[104px] rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-[280px] rounded-xl" />
            </div>
          ) : billing.isError ? (
            <ErrorState description="Could not load billing." onRetry={() => billing.refetch()} />
          ) : billing.data && billing.data.ticket_count > 0 ? (
            <BillingPanel b={billing.data} />
          ) : (
            <EmptyState
              title="No billable loads yet"
              description="Billing appears once loads are captured for this event."
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
