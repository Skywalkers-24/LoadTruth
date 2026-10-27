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
  /** Itemized flags with AI narratives; populated on the single-ticket GET. */
  anomalies?: AnomalyItem[];
  valuation: Valuation;
  created_at: string;
}

export interface AnomalyItem {
  type: string;
  severity: "info" | "warn" | "high";
  explanation: string;
  evidence_frame: string | null;
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

export interface Truck {
  id: string;
  tenant_id: string;
  truck_number: string;
  body_type: string | null;
  certified_cubic_yards: string;
  registry_source: string | null;
  created_at: string;
}

export interface TruckInput {
  truck_number: string;
  body_type?: string | null;
  certified_cubic_yards: string;
  registry_source?: string | null;
}

export type SourceKind =
  | "upload"
  | "s3"
  | "gcs"
  | "azure_blob"
  | "google_drive"
  | "dropbox"
  | "rtsp"
  | "hls"
  | "webhook";
export type SourceStatus = "active" | "paused" | "error";

export interface Source {
  id: string;
  tenant_id: string;
  event_id: string;
  kind: SourceKind;
  name: string;
  config: Record<string, unknown>;
  status: SourceStatus;
  created_at: string;
}

export interface SourceInput {
  kind: SourceKind;
  name: string;
  config?: Record<string, unknown>;
  status?: SourceStatus;
}

export interface SourceTestResult {
  ok: boolean;
  detail: string;
}

export interface EventInput {
  name: string;
  location?: string | null;
  status?: string;
  rate_table?: Record<string, number>;
}

/** A role within the product's RBAC vocabulary. */
export type Role = "monitor" | "supervisor" | "county_admin" | "auditor" | "super_admin";
export type UserStatus = "active" | "inactive";

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status: UserStatus;
  created_at: string;
}

export interface UserInput {
  email: string;
  full_name?: string | null;
  role?: Role;
  status?: UserStatus;
}

export interface TenantMembership {
  tenant_id: string;
  tenant_name: string;
  roles: string[];
}

export interface AuthContext {
  user_id: string;
  email: string | null;
  memberships: TenantMembership[];
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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Session token. Held in memory and mirrored to localStorage so a reload
// keeps the session. The provider calls setAuthToken on login/logout. ──
const TOKEN_KEY = "loadtruth-token";

/** Read the stored token defensively (some test envs lack localStorage). */
function readStoredToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

let authToken: string | null = readStoredToken();

export function setAuthToken(token: string | null): void {
  authToken = token;
  try {
    if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
    else globalThis.localStorage?.removeItem(TOKEN_KEY);
  } catch {
    /* no storage in this environment */
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    let detail = `request to ${path} failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      /* no JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
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

/**
 * Returns the signed-in user's tenants + roles, or null when unavailable.
 * This build does not wire a bearer-token sign-in flow, so the endpoint
 * typically returns 401 and we surface a reference view instead of fake users.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    return await request<AuthContext>("/auth-context");
  } catch {
    return null;
  }
}

// ── Session login (the app's own auth) ──
export interface Capabilities {
  review_tickets: boolean;
  manage_trucks: boolean;
  manage_sources: boolean;
  manage_events: boolean;
  ingest: boolean;
  manage_users: boolean;
}

export interface Member {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  tenant_id: string;
  capabilities: Capabilities;
}

export interface DirectoryMember {
  email: string;
  full_name: string | null;
  role: Role;
}

export interface LoginResult {
  token: string;
  member: Member;
}

/** The members offered as sign-in options on the login screen. */
export async function getDirectory(): Promise<DirectoryMember[]> {
  return request<DirectoryMember[]>("/auth/directory");
}

/** Sign in by email; returns a token and the member (with capabilities). */
export async function login(email: string): Promise<LoginResult> {
  return request<LoginResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** The current signed-in member, refreshed from the server. */
export async function getMe(): Promise<Member> {
  return request<Member>("/auth/me");
}

/** Log out (stateless token; the client also discards it). */
export async function logout(): Promise<void> {
  await request<void>("/auth/logout", { method: "POST" });
}

// ── AI analyst chat + system insight ──
export interface PipelineStats {
  total_runs: number;
  cache_hits: number;
  cache_hit_rate: number;
  per_stage: Record<string, number>;
  spent_usd: number;
  hard_cap_usd: number;
  remaining_usd: number;
  soft_cap_hit: boolean;
  hard_cap_hit: boolean;
  mode: "live" | "fixtures";
  sam_model: string;
  spark_model: string;
}

export function getPipelineStats(): Promise<PipelineStats> {
  return request<PipelineStats>("/system/pipeline");
}

export interface PipelineStage {
  key: string;
  label: string;
  model: string;
  status: "ok" | "skipped" | "flagged";
  summary: string;
  confidence: number | null;
  duration_ms: number;
}

export interface PipelineJob {
  content_hash: string;
  event_id: string;
  ticket_id: string | null;
  truck_id: string | null;
  debris_class: string | null;
  outcome: "running" | "drafted" | "no_truck" | "cached";
  cached: boolean;
  anomaly_count: number;
  dollar_value: number | null;
  started_at: number;
  stages: PipelineStage[];
}

export function getPipelineJobs(eventId?: string): Promise<PipelineJob[]> {
  const q = eventId ? `?event_id=${eventId}&limit=50` : "?limit=50";
  return request<PipelineJob[]>(`/system/jobs${q}`);
}

export function getJobForTicket(ticketId: string): Promise<PipelineJob | null> {
  return request<PipelineJob | null>(`/system/jobs/ticket/${ticketId}`);
}

// ── AI model & reasoning-effort configuration (admin) ──
export type ReasoningEffort = "minimal" | "low" | "balanced" | "high" | "max";
export type CostMode = "standard" | "contributor";

export interface ModelPricing {
  input: number | null;
  cached_input: number | null;
  output: number | null;
  unit: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  kind: string;
  context_tokens: number | null;
  modalities: string[];
  description: string;
  efforts: ReasoningEffort[];
  cost_modes: CostMode[];
  pricing: ModelPricing | null;
  premium: boolean;
  available: boolean;
}

export interface TaskInfo {
  id: string;
  name: string;
  description: string;
  kind: string;
  eligible_models: string[];
  default_model: string;
  default_effort: ReasoningEffort;
  default_cost_mode: CostMode;
  supports_effort: boolean;
}

export interface TaskConfig {
  task_id: string;
  model: string;
  effort: ReasoningEffort;
  cost_mode: CostMode;
  max_output_tokens: number | null;
}

export interface AiConfigResponse {
  catalog: {
    models: ModelInfo[];
    tasks: TaskInfo[];
    efforts: ReasoningEffort[];
    cost_modes: CostMode[];
  };
  config: TaskConfig[];
}

export interface TaskConfigUpdate {
  model?: string;
  effort?: ReasoningEffort;
  cost_mode?: CostMode;
  max_output_tokens?: number | null;
}

export function getAiConfig(): Promise<AiConfigResponse> {
  return request<AiConfigResponse>("/system/ai-config");
}

export function getChatStarters(): Promise<{ prompts: string[] }> {
  return request<{ prompts: string[] }>("/chat/starters");
}

export interface ChatEvents {
  onTool?: (tool: string) => void;
  onToken?: (text: string) => void;
  onDone?: (suggestions: string[]) => void;
  onError?: (message: string) => void;
}

/**
 * Stream an analyst answer over SSE. Parses `event:`/`data:` frames and invokes
 * the callbacks. Returns a function to abort the stream.
 */
export function streamChat(
  body: { event_id: string; message: string; event_name?: string },
  handlers: ChatEvents,
): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`${baseUrl()}/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        handlers.onError?.(`chat failed (${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const ev = /event:\s*(.+)/.exec(frame)?.[1]?.trim();
          const dataLine = /data:\s*(.+)/.exec(frame)?.[1];
          if (!ev || !dataLine) continue;
          const data = JSON.parse(dataLine);
          if (ev === "tool") handlers.onTool?.(data.tool);
          else if (ev === "token") handlers.onToken?.(data.text);
          else if (ev === "done") handlers.onDone?.(data.suggestions ?? []);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") handlers.onError?.(String(err));
    }
  })();
  return () => controller.abort();
}

async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    body: form,
    cache: "no-store",
    headers: authToken ? { authorization: `Bearer ${authToken}` } : undefined,
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
  getPipelineJobs,
  getJobForTicket,
  /** Absolute-via-rewrite URLs for the downloadable exports. */
  exportCsvUrl: (eventId: string) => `${baseUrl()}/events/${eventId}/export.csv`,
  auditPacketUrl: (eventId: string) => `${baseUrl()}/events/${eventId}/audit-packet.html`,

  // Admin — events
  createEvent: (body: EventInput) =>
    request<EventSummary>("/events", { method: "POST", body: JSON.stringify(body) }),
  updateEvent: (id: string, body: Partial<EventInput>) =>
    request<EventSummary>(`/events/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // Admin — trucks
  listTrucks: () => request<Truck[]>("/trucks"),
  createTruck: (body: TruckInput) =>
    request<Truck>("/trucks", { method: "POST", body: JSON.stringify(body) }),
  updateTruck: (id: string, body: Partial<TruckInput>) =>
    request<Truck>(`/trucks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTruck: (id: string) => request<void>(`/trucks/${id}`, { method: "DELETE" }),

  // Admin — users (tenant members + roles)
  listUsers: () => request<User[]>("/users"),
  createUser: (body: UserInput) =>
    request<User>("/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: string, body: Partial<UserInput>) =>
    request<User>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: string) => request<void>(`/users/${id}`, { method: "DELETE" }),

  // Admin — AI models & reasoning effort
  getAiConfig,
  updateAiConfig: (taskId: string, body: TaskConfigUpdate) =>
    request<TaskConfig>(`/system/ai-config/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  resetAiConfig: (taskId: string) =>
    request<TaskConfig>(`/system/ai-config/${taskId}/reset`, { method: "POST" }),

  // Admin — sources
  listSources: (eventId: string) => request<Source[]>(`/events/${eventId}/sources`),
  createSource: (eventId: string, body: SourceInput) =>
    request<Source>(`/events/${eventId}/sources`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSource: (id: string, body: Partial<SourceInput>) =>
    request<Source>(`/sources/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSource: (id: string) => request<void>(`/sources/${id}`, { method: "DELETE" }),
  testSource: (id: string) => request<SourceTestResult>(`/sources/${id}/test`, { method: "POST" }),
};
