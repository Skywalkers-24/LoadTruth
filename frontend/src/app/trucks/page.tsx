"use client";

import { AppShell } from "@/components/shell/app-shell";
import { TruckRegistry } from "@/components/admin/truck-registry";
import { Card } from "@/components/ui/shadcn/card";
import { TruckIcon } from "@/components/ui/icons";

/**
 * Trucks: the certified-truck registry as its own top-level screen. Capacity
 * here drives the cubic-yard math for every load, so it has room of its own
 * rather than living as a tab inside Settings.
 */
export default function TrucksPage() {
  return (
    <AppShell section="Trucks" fluid>
      <div className="mx-auto flex min-h-0 w-full max-w-[1100px] flex-1 flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
            <TruckIcon size={18} />
          </span>
          <div className="flex min-w-0 flex-col">
            <h1 className="lt-page-title">Truck registry</h1>
            <p className="truncate text-[12px] text-muted-foreground">
              Certified trucks and their bed capacity.
            </p>
          </div>
        </div>

        <Card className="lt-fab-safe lt-scroll min-h-0 flex-1 overflow-y-auto p-5">
          <TruckRegistry />
        </Card>
      </div>
    </AppShell>
  );
}
