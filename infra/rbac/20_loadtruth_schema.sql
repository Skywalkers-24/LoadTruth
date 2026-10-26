-- ═══════════════════════════════════════════════════════════════════════════
-- LoadTruth operational schema (PLAN.md §7)
-- ═══════════════════════════════════════════════════════════════════════════
-- Tenancy comes from the vendored extension: a tenant IS an rbac.group, so every
-- operational row's tenant_id references rbac.groups(id). Memberships/roles live
-- in rbac.members. We do NOT create a parallel tenants/memberships table.
--
-- RLS is enabled here; the policies themselves live in 30_loadtruth_policies.sql.
-- Every FK and every hot-path filter/sort column is indexed in this file
-- (agent-protocol §7: index in the same migration that introduces the access).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector for truck-registry fuzzy match

-- ─────────────────────────────────────────────────────────────────────────
-- events — a disaster event scopes work within a tenant
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.events (
    id          uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id   uuid        NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    name        text        NOT NULL,
    location    text,
    status      text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'closed', 'archived')),
    rate_table  jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- $/CY by debris_class
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_tenant        ON public.events (tenant_id);
CREATE INDEX idx_events_tenant_status ON public.events (tenant_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- sources — connected evidence sources (PLAN.md §3, §5b): not upload-only
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.sources (
    id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id  uuid        NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    event_id   uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    kind       text        NOT NULL
                           CHECK (kind IN ('upload','rtsp','hls','ip_camera',
                                           'cloud_bucket','webhook','mobile')),
    name       text        NOT NULL,
    config     jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- url/creds-ref/options per kind
    status     text        NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','paused','error')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sources_tenant ON public.sources (tenant_id);
CREATE INDEX idx_sources_event  ON public.sources (event_id);

-- ─────────────────────────────────────────────────────────────────────────
-- trucks — certified-truck registry (capacity lookup, Stage 4)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.trucks (
    id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id             uuid        NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    truck_number          text        NOT NULL,
    body_type             text,
    certified_cubic_yards numeric(8,2) NOT NULL CHECK (certified_cubic_yards > 0),
    registry_source       text,
    embedding             vector(384),                     -- fuzzy match on OCR noise
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, truck_number)
);
CREATE INDEX idx_trucks_tenant ON public.trucks (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────
-- clips — one ingested artifact (video or image) from a source
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.clips (
    id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id    uuid        NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    source_id    uuid        REFERENCES public.sources(id) ON DELETE SET NULL,
    storage_path text        NOT NULL,
    media_kind   text        NOT NULL DEFAULT 'video'
                             CHECK (media_kind IN ('video','image')),
    fps_sampled  numeric(5,2),
    content_hash text        NOT NULL,                     -- cache key for all AI calls
    duration_s   numeric(8,2),
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, content_hash)                       -- dedupe => no double-spend
);
CREATE INDEX idx_clips_tenant       ON public.clips (tenant_id);
CREATE INDEX idx_clips_event        ON public.clips (event_id);
CREATE INDEX idx_clips_content_hash ON public.clips (content_hash);

-- ─────────────────────────────────────────────────────────────────────────
-- pipeline_runs — per-stage AI cost ledger ($150 budget; agent-protocol §9)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.pipeline_runs (
    id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id  uuid        NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    clip_id    uuid        NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    stage      text        NOT NULL,
    model      text,
    status     text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','running','done','error')),
    tokens_in  integer     NOT NULL DEFAULT 0,
    tokens_out integer     NOT NULL DEFAULT 0,
    latency_ms integer,
    cost_usd   numeric(10,6) NOT NULL DEFAULT 0,
    cached     boolean     NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pruns_tenant ON public.pipeline_runs (tenant_id);
CREATE INDEX idx_pruns_clip   ON public.pipeline_runs (clip_id);

-- ─────────────────────────────────────────────────────────────────────────
-- tracks — SAM per-object boxes+masks across frames
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.tracks (
    id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id     uuid        NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    clip_id       uuid        NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    object_label  text        NOT NULL,                    -- dump truck / truck bed / ...
    sam_object_id text,
    frames        jsonb       NOT NULL DEFAULT '[]'::jsonb,-- boxes + mask refs
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracks_tenant ON public.tracks (tenant_id);
CREATE INDEX idx_tracks_clip   ON public.tracks (clip_id);

-- ─────────────────────────────────────────────────────────────────────────
-- tickets — the FEMA/FROC load ticket (draft until a human confirms)
-- ─────────────────────────────────────────────────────────────────────────
-- Columns carry BOTH LoadTruth's measured estimate and the human monitor's call,
-- plus the persisted signed delta (monitor - LoadTruth) — the demo's "money
-- frame" (PLAN.md §7a). Delta is positive when the monitor over-called =>
-- potential overbilling. Math is deterministic (app/tickets/money.py); values
-- are persisted here, never recomputed ad hoc in the UI.
CREATE TABLE public.tickets (
    id                    uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id             uuid         NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    event_id              uuid         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    clip_id               uuid         NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    truck_id              uuid         REFERENCES public.trucks(id) ON DELETE SET NULL,

    -- inputs from the registry (Stage 4) + the event rate table
    certified_cubic_yards numeric(10,3) NOT NULL,
    debris_class          text         NOT NULL CHECK (debris_class IN
                                        ('vegetative','construction_demolition',
                                         'white_goods','hazardous','other')),
    rate_per_cy           numeric(12,2) NOT NULL DEFAULT 0,

    -- LoadTruth's measured estimate (Stage 5)
    est_fill_pct          numeric(5,2) NOT NULL CHECK (est_fill_pct BETWEEN 0 AND 100),
    est_cubic_yards       numeric(10,3) NOT NULL,
    est_dollar_value      numeric(12,2) NOT NULL,

    -- the human monitor's call — the baseline (set at review time)
    monitor_call_fill_pct numeric(5,2) CHECK (monitor_call_fill_pct BETWEEN 0 AND 100),
    monitor_cubic_yards   numeric(10,3),
    monitor_dollar_value  numeric(12,2),

    -- persisted signed delta (monitor - LoadTruth): the money frame (§7a)
    delta_cubic_yards     numeric(10,3),
    delta_dollar_value    numeric(12,2),

    status                text         NOT NULL DEFAULT 'draft'
                                       CHECK (status IN ('draft','confirmed','overridden','disputed')),
    confirmed_fill_pct    numeric(5,2) CHECK (confirmed_fill_pct BETWEEN 0 AND 100),
    evidence_frames       jsonb        NOT NULL DEFAULT '[]'::jsonb,
    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_tenant        ON public.tickets (tenant_id);
CREATE INDEX idx_tickets_event         ON public.tickets (event_id);
CREATE INDEX idx_tickets_tenant_event  ON public.tickets (tenant_id, event_id);
CREATE INDEX idx_tickets_tenant_status ON public.tickets (tenant_id, status);

-- ─────────────────────────────────────────────────────────────────────────
-- anomalies — deterministic flags + Spark narrative
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.anomalies (
    id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id      uuid        NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    ticket_id      uuid        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    type           text        NOT NULL,
    severity       text        NOT NULL DEFAULT 'info'
                               CHECK (severity IN ('info','warn','high')),
    explanation    text,
    evidence_frame text,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_anomalies_tenant ON public.anomalies (tenant_id);
CREATE INDEX idx_anomalies_ticket ON public.anomalies (ticket_id);

-- ─────────────────────────────────────────────────────────────────────────
-- benchmarks — accuracy vs. careful human measurement (±10% target)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.benchmarks (
    id             uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id      uuid         NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    clip_id        uuid         NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    human_fill_pct numeric(5,2) NOT NULL,
    model_fill_pct numeric(5,2) NOT NULL,
    abs_error      numeric(5,2) GENERATED ALWAYS AS (abs(model_fill_pct - human_fill_pct)) STORED,
    within_10pct   boolean      GENERATED ALWAYS AS (abs(model_fill_pct - human_fill_pct) <= 10) STORED,
    created_at     timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_benchmarks_tenant ON public.benchmarks (tenant_id);

-- ─────────────────────────────────────────────────────────────────────────
-- reports — generated audit packets / accuracy / fraud summaries
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.reports (
    id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id    uuid        NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    event_id     uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    kind         text        NOT NULL CHECK (kind IN ('audit_packet','accuracy','fraud')),
    storage_path text        NOT NULL,
    generated_by uuid,                                     -- auth.users id
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_tenant ON public.reports (tenant_id);
CREATE INDEX idx_reports_event  ON public.reports (event_id);

-- ─────────────────────────────────────────────────────────────────────────
-- audit_log — append-only neutral evidence trail (the moat)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE public.audit_log (
    id         uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id  uuid        NOT NULL REFERENCES rbac.groups(id) ON DELETE CASCADE,
    actor      uuid,                                       -- auth.users id
    entity     text        NOT NULL,
    action     text        NOT NULL,
    before     jsonb,
    after      jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant ON public.audit_log (tenant_id, created_at DESC);

-- Enable RLS on every operational table (deny-all until policies in file 30).
ALTER TABLE public.events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trucks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomalies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmarks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log     ENABLE ROW LEVEL SECURITY;
