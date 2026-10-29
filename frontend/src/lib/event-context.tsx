"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { EventSummary } from "@/lib/api";
import { useEvents } from "@/lib/hooks";

/**
 * Shared organization/event context. This build seeds a single tenant, but the
 * events API already returns a list — so the switcher is wired to real data and
 * the selected event is retained as the user moves between routes.
 *
 * Organization is derived from the event's location (state/region) since the
 * backend does not yet expose a separate org entity; we never fabricate extra
 * organizations.
 */
interface EventContextValue {
  events: EventSummary[];
  isLoading: boolean;
  isError: boolean;
  selected: EventSummary | undefined;
  selectedId: string | undefined;
  setSelectedId: (id: string) => void;
  refetch: () => void;
}

const EventCtx = createContext<EventContextValue | null>(null);
const STORAGE_KEY = "loadtruth-event";

export function EventProvider({ children }: { children: React.ReactNode }) {
  const query = useEvents();
  const events = useMemo(() => query.data ?? [], [query.data]);
  const [selectedId, setSelectedIdState] = useState<string | undefined>(undefined);

  // Resolve the selected event once events load: persisted choice, else first.
  useEffect(() => {
    if (events.length === 0) return;
    setSelectedIdState((current) => {
      if (current && events.some((e) => e.id === current)) return current;
      const stored =
        typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      const requested =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("event")
          : null;
      if (requested && events.some((e) => e.id === requested)) return requested;
      if (stored && events.some((e) => e.id === stored)) return stored;
      return events[0]?.id;
    });
  }, [events]);

  const setSelectedId = useCallback((id: string) => {
    setSelectedIdState(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const selected = useMemo(
    () => events.find((e) => e.id === selectedId),
    [events, selectedId],
  );

  const refetch = useCallback(() => void query.refetch(), [query]);

  // Memoized so consumers of this app-wide context don't re-render on every
  // parent render.
  const value = useMemo<EventContextValue>(
    () => ({
      events,
      isLoading: query.isLoading,
      isError: query.isError,
      selected,
      selectedId,
      setSelectedId,
      refetch,
    }),
    [events, query.isLoading, query.isError, selected, selectedId, setSelectedId, refetch],
  );

  return <EventCtx.Provider value={value}>{children}</EventCtx.Provider>;
}

export function useEventContext(): EventContextValue {
  const ctx = useContext(EventCtx);
  if (!ctx) throw new Error("useEventContext must be used within EventProvider");
  return ctx;
}

/** Derive a readable organization name + scope from an event. */
export function orgFromEvent(event: EventSummary | undefined): {
  org: string;
  scope: string | null;
} {
  if (!event) return { org: "LoadTruth", scope: null };
  const loc = event.location?.trim();
  if (!loc) return { org: "LoadTruth Monitoring", scope: null };
  // Location like "Pinellas County, Florida" -> org by region, scope full.
  const region = loc.split(",").slice(-1)[0]?.trim();
  return { org: region ? `${region} Response Monitoring` : "LoadTruth Monitoring", scope: loc };
}
