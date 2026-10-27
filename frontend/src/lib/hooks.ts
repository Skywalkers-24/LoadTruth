"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  getAuthContext,
  getHealth,
  type EventInput,
  type SourceInput,
  type TicketQuery,
  type TicketStatus,
  type TruckInput,
  type UserInput,
} from "@/lib/api";

export function useEvents() {
  return useQuery({ queryKey: ["events"], queryFn: () => api.listEvents() });
}

/** Signed-in user's tenants + roles. Null when no session is wired. */
export function useAuthContext() {
  return useQuery({
    queryKey: ["auth-context"],
    queryFn: () => getAuthContext(),
    staleTime: 60_000,
    retry: false,
  });
}

/** Live backend health, polled. Used by the top-bar status indicator. */
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => getHealth(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Paginated/filtered ticket list. Keeps the previous page visible while fetching. */
export function useTickets(query: TicketQuery) {
  return useQuery({
    queryKey: ["tickets", query],
    queryFn: () => api.listTickets(query),
    enabled: Boolean(query.eventId),
    placeholderData: keepPreviousData,
  });
}

/** A single ticket by id (used when the selected ticket is not on the current page). */
export function useTicket(id: string | null) {
  return useQuery({
    queryKey: ["ticket", id],
    queryFn: () => api.getTicket(id as string),
    enabled: Boolean(id),
  });
}

export function useDashboard(eventId: string | undefined) {
  return useQuery({
    queryKey: ["dashboard", eventId],
    queryFn: () => api.dashboard(eventId as string),
    enabled: Boolean(eventId),
  });
}

export function useReportsSummary(eventId: string | undefined) {
  return useQuery({
    queryKey: ["reports-summary", eventId],
    queryFn: () => api.reportsSummary(eventId as string),
    enabled: Boolean(eventId),
  });
}

/** Record a monitor's fill-% call; invalidates tickets + dashboard. */
export function useSetMonitorCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pct }: { id: string; pct: string }) => api.setMonitorCall(id, pct),
    onSuccess: invalidateAll(qc),
  });
}

/** Upload a clip; the backend runs the pipeline and drafts a ticket. */
export function useIngest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, file }: { eventId: string; file: File }) => api.ingest(eventId, file),
    onSuccess: invalidateAll(qc),
  });
}

/** Confirm / override / dispute a ticket; invalidates tickets + dashboard. */
export function useSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TicketStatus }) => api.setStatus(id, status),
    onSuccess: invalidateAll(qc),
  });
}

/** Invalidate every event-scoped query after a write. */
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  return () => {
    void qc.invalidateQueries({ queryKey: ["tickets"] });
    void qc.invalidateQueries({ queryKey: ["ticket"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["reports-summary"] });
  };
}

// ── Admin: trucks ───────────────────────────────────────────────────────────
export function useTrucks() {
  return useQuery({ queryKey: ["trucks"], queryFn: () => api.listTrucks() });
}

export function useTruckMutations() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["trucks"] });
  const create = useMutation({ mutationFn: api.createTruck, onSuccess: done });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<TruckInput> }) =>
      api.updateTruck(id, body),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteTruck(id), onSuccess: done });
  return { create, update, remove };
}

// ── Admin: users (tenant members) ────────────────────────────────────────────
export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: () => api.listUsers() });
}

export function useUserMutations() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["users"] });
  const create = useMutation({ mutationFn: api.createUser, onSuccess: done });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<UserInput> }) =>
      api.updateUser(id, body),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteUser(id), onSuccess: done });
  return { create, update, remove };
}

// ── Admin: sources ──────────────────────────────────────────────────────────
export function useSources(eventId: string | undefined) {
  return useQuery({
    queryKey: ["sources", eventId],
    queryFn: () => api.listSources(eventId as string),
    enabled: Boolean(eventId),
  });
}

export function useSourceMutations(eventId: string | undefined) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["sources", eventId] });
  const create = useMutation({
    mutationFn: (body: SourceInput) => api.createSource(eventId as string, body),
    onSuccess: done,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<SourceInput> }) =>
      api.updateSource(id, body),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteSource(id), onSuccess: done });
  const test = useMutation({ mutationFn: (id: string) => api.testSource(id) });
  return { create, update, remove, test };
}

// ── Admin: event rate table ─────────────────────────────────────────────────
export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<EventInput> }) =>
      api.updateEvent(id, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["events"] });
      void qc.invalidateQueries({ queryKey: ["reports-summary"] });
    },
  });
}
