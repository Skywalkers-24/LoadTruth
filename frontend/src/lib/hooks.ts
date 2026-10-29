"use client";

import { useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth";
import {
  api,
  getAuthContext,
  getHealth,
  type EventInput,
  type SourceInput,
  type TaskConfigUpdate,
  type TicketPatch,
  type TicketQuery,
  type TicketStatus,
  type TruckInput,
  type UserInput,
} from "@/lib/api";

export function useEvents() {
  const { member } = useAuth();
  return useQuery({
    queryKey: ["events"],
    queryFn: () => api.listEvents(),
    enabled: Boolean(member),
  });
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
    refetchInterval: (query) => (query.state.status === "error" ? 5_000 : 30_000),
    staleTime: 10_000,
    retry: false,
  });
}

/** Paginated/filtered ticket list. Keeps the previous page visible while fetching. */
export function useTickets(query: TicketQuery) {
  return useQuery({
    queryKey: ["tickets", query],
    queryFn: () => api.listTickets(query),
    // Normally scoped to an event; `allTenant` opts into the whole-tenant list
    // (admin "All events" reports) where there is intentionally no event id.
    enabled: Boolean(query.eventId) || query.allTenant === true,
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

/**
 * Reports for every event the member can see, fetched in parallel. Used by the
 * admin "All events" view in Reports to combine totals across events.
 */
export function useAllReports(eventIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["reports-all", [...eventIds].sort()],
    enabled: enabled && eventIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        eventIds.map(async (id) => ({
          eventId: id,
          summary: await api.reportsSummary(id),
          tickets: (await api.listTickets({ eventId: id, limit: 100, offset: 0 })).items,
        })),
      );
      return results;
    },
  });
}

/**
 * Billing roll-up. When `eventId` is given, the single-event invoice; when it
 * is undefined and `enabled`, the combined all-events invoice.
 */
export function useBilling(eventId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["billing", eventId ?? "all"],
    enabled,
    queryFn: () => (eventId ? api.eventBilling(eventId) : api.combinedBilling()),
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

/** Edit a ticket's truck ID / debris class; recomputes valuation + invalidates. */
export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TicketPatch }) => api.updateTicket(id, body),
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
    void qc.invalidateQueries({ queryKey: ["billing"] });
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
export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.listUsers(),
    // The /users endpoint is county-admin-and-up; skip the request for roles
    // that can't manage users so they never hit a 403.
    enabled,
  });
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

// ── AI pipeline jobs (live) ──────────────────────────────────────────────────
export function usePipelineJobs(opts: {
  eventId: string | undefined;
  limit: number;
  offset: number;
}) {
  const { eventId, limit, offset } = opts;
  return useQuery({
    queryKey: ["pipeline-jobs", eventId, limit, offset],
    queryFn: () => api.getPipelineJobs({ eventId, limit, offset }),
    refetchInterval: 4000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Live progress of the latest pipeline run for an event, polled every 3s while
 * a run is active. The server holds the snapshot, so a page refreshed mid-run
 * still sees the in-flight run. Polling stops once the run is done (and when the
 * tab is hidden).
 */
export function usePipelineProgress(eventId: string | undefined, pollWhileActive = false) {
  const qc = useQueryClient();
  useEffect(() => {
    if (eventId && pollWhileActive) {
      void qc.invalidateQueries({ queryKey: ["pipeline-progress", eventId] });
    }
  }, [eventId, pollWhileActive, qc]);
  return useQuery({
    queryKey: ["pipeline-progress", eventId],
    enabled: Boolean(eventId),
    queryFn: () => api.getPipelineProgress(eventId as string),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "done") return false;
      return status === "running" || pollWhileActive ? 1500 : false;
    },
    refetchIntervalInBackground: false,
  });
}

export function useJobForTicket(ticketId: string | null) {
  return useQuery({
    queryKey: ["pipeline-job", ticketId],
    queryFn: () => api.getJobForTicket(ticketId as string),
    enabled: Boolean(ticketId),
  });
}

/** The persisted per-ticket AI pipeline trace (always available). */
export function useTicketPipeline(ticketId: string | null) {
  return useQuery({
    queryKey: ["ticket-pipeline", ticketId],
    queryFn: () => api.getTicketPipeline(ticketId as string),
    enabled: Boolean(ticketId),
  });
}

/** The ticket's processed clip + SAM output (null when it has none). */
export function useTicketEvidence(ticketId: string | null) {
  return useQuery({
    queryKey: ["ticket-evidence", ticketId],
    queryFn: () => api.getTicketEvidence(ticketId as string),
    enabled: Boolean(ticketId),
    staleTime: 5 * 60_000,
  });
}

// ── Admin: AI models, reasoning effort & cost mode ──────────────────────────
export function useAiConfig() {
  return useQuery({ queryKey: ["ai-config"], queryFn: () => api.getAiConfig() });
}

export function useUpdateAiConfig() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["ai-config"] });
    void qc.invalidateQueries({ queryKey: ["pipeline"] });
  };
  const update = useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: TaskConfigUpdate }) =>
      api.updateAiConfig(taskId, body),
    onSuccess: done,
  });
  const reset = useMutation({
    mutationFn: (taskId: string) => api.resetAiConfig(taskId),
    onSuccess: done,
  });
  return { update, reset };
}
