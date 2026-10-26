/**
 * Thin typed client for the FastAPI backend. During local dev, requests go
 * through the Next.js rewrite in `next.config.ts` (`/api/*` -> backend), so the
 * browser uses a relative base and server components use BACKEND_URL.
 */

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * Base URL. In the browser, requests go through the Next.js `/api/*` rewrite
 * (next.config.ts) to the backend; on the server we call the backend directly.
 */
function baseUrl(): string {
  return typeof window === "undefined" ? BACKEND_URL : "/api";
}

export interface Health {
  status: string;
  environment: string;
  model_api_configured: boolean;
}

export type TicketStatus = "draft" | "confirmed" | "overridden" | "disputed";
export type DebrisClass =
  "vegetative" | "construction_demolition" | "white_goods" | "hazardous" | "other";

/** The §7a money frame: LoadTruth estimate, monitor call, signed delta. */
export interface Valuation {
  certified_cubic_yards: string;
  rate_per_cy: string;
  est_fill_pct: string;
  est_cubic_yards: string;
  est_dollar_value: string;
  monitor_fill_pct: string | null;
  monitor_cubic_yards: string | null;
  monitor_dollar_value: string | null;
  delta_cubic_yards: string | null;
  delta_dollar_value: string | null;
  is_overbill: boolean;
}

export interface Ticket {
  id: string;
  tenant_id: string;
  event_id: string;
  clip_id: string | null;
  truck_id: string | null;
  debris_class: DebrisClass;
  status: TicketStatus;
  confirmed_fill_pct: string | null;
  evidence_frames: string[];
  anomaly_count: number;
  valuation: Valuation;
  created_at: string;
}

export interface EventSummary {
  id: string;
  tenant_id: string;
  name: string;
  location: string | null;
  status: string;
  rate_table: Record<string, number>;
  created_at: string;
}

export interface Dashboard {
  event_id: string;
  ticket_count: number;
  reviewed_count: number;
  anomaly_count: number;
  overbill_ticket_count: number;
  total_delta_cubic_yards: string;
  total_delta_dollar_value: string;
  accuracy_within_10pct: number | null;
}

export interface PaginatedTickets {
  items: Ticket[];
  total: number;
  limit: number;
  offset: number;
}

export interface TicketQuery {
  eventId?: string;
  status?: TicketStatus;
  debrisClass?: DebrisClass;
  limit?: number;
  offset?: number;
}

export interface ReportsSummary {
  event_id: string;
  ticket_count: number;
  counts_by_status: Record<string, number>;
  counts_by_debris_class: Record<string, number>;
  total_est_dollar_value: string;
  total_delta_dollar_value: string;
  overbill_ticket_count: number;
  overbill_dollar_value: string;
  anomaly_counts_by_severity: Record<string, number>;
  reviewed_count: number;
  pending_count: number;
  accuracy_within_10pct: number | null;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    cache: "no-store",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(res.status, `request to ${path} failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** Returns backend health, or null if the backend is unreachable. */
export async function getHealth(): Promise<Health | null> {
  try {
    return await request<Health>("/health");
  } catch {
    return null;
  }
}

async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status, `upload to ${path} failed (${res.status})`);
  return (await res.json()) as T;
}

function ticketQueryString(q: TicketQuery): string {
  const p = new URLSearchParams();
  if (q.eventId) p.set("event_id", q.eventId);
  if (q.status) p.set("status", q.status);
  if (q.debrisClass) p.set("debris_class", q.debrisClass);
  if (q.limit !== undefined) p.set("limit", String(q.limit));
  if (q.offset !== undefined) p.set("offset", String(q.offset));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  listEvents: () => request<EventSummary[]>("/events"),
  listTickets: (q: TicketQuery = {}) =>
    request<PaginatedTickets>(`/tickets${ticketQueryString(q)}`),
  getTicket: (id: string) => request<Ticket>(`/tickets/${id}`),
  setMonitorCall: (id: string, monitorFillPct: string) =>
    request<Ticket>(`/tickets/${id}/monitor-call`, {
      method: "PATCH",
      body: JSON.stringify({ monitor_fill_pct: monitorFillPct }),
    }),
  setStatus: (id: string, status: TicketStatus) =>
    request<Ticket>(`/tickets/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  dashboard: (eventId: string) => request<Dashboard>(`/events/${eventId}/dashboard`),
  reportsSummary: (eventId: string) =>
    request<ReportsSummary>(`/events/${eventId}/reports/summary`),
  ingest: (eventId: string, file: File) => upload<Ticket>(`/events/${eventId}/ingest`, file),
  /** Absolute-via-rewrite URLs for the downloadable exports. */
  exportCsvUrl: (eventId: string) => `${baseUrl()}/events/${eventId}/export.csv`,
  auditPacketUrl: (eventId: string) => `${baseUrl()}/events/${eventId}/audit-packet.html`,
};

export { ApiError };
