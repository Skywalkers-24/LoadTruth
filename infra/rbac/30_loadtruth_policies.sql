-- ═══════════════════════════════════════════════════════════════════════════
-- LoadTruth RLS policies — tenant isolation + RBAC on operational tables
-- ═══════════════════════════════════════════════════════════════════════════
-- Isolation and authorization are enforced here at the data layer (defense in
-- depth with the API). Reads require membership in the row's tenant; writes
-- require the matching permission. service_role bypasses RLS for worker/admin ops.
--
-- Pattern: USING (rbac.is_member(tenant_id)) for reads,
--          WITH CHECK (rbac.has_permission(tenant_id, '<perm>')) for writes.
-- All permission names come from 10_loadtruth_roles.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper: service_role full access on a table (worker + platform ops).
-- Repeated per table because policy bodies can't be parameterized.

-- ─── events ────────────────────────────────────────────────────────────────
CREATE POLICY "events read"   ON public.events FOR SELECT TO authenticated
    USING (rbac.is_member(tenant_id));
CREATE POLICY "events write"  ON public.events FOR ALL TO authenticated
    USING (rbac.has_permission(tenant_id, 'event.manage'))
    WITH CHECK (rbac.has_permission(tenant_id, 'event.manage'));
CREATE POLICY "events svc"    ON public.events FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── sources ───────────────────────────────────────────────────────────────
CREATE POLICY "sources read"  ON public.sources FOR SELECT TO authenticated
    USING (rbac.is_member(tenant_id));
CREATE POLICY "sources write" ON public.sources FOR ALL TO authenticated
    USING (rbac.has_permission(tenant_id, 'source.manage'))
    WITH CHECK (rbac.has_permission(tenant_id, 'source.manage'));
CREATE POLICY "sources svc"   ON public.sources FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── trucks ────────────────────────────────────────────────────────────────
CREATE POLICY "trucks read"   ON public.trucks FOR SELECT TO authenticated
    USING (rbac.is_member(tenant_id));
CREATE POLICY "trucks write"  ON public.trucks FOR ALL TO authenticated
    USING (rbac.has_permission(tenant_id, 'truck.manage'))
    WITH CHECK (rbac.has_permission(tenant_id, 'truck.manage'));
CREATE POLICY "trucks svc"    ON public.trucks FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── clips ─────────────────────────────────────────────────────────────────
-- Clips are created by the ingest pipeline (service_role). Members read only.
CREATE POLICY "clips read"    ON public.clips FOR SELECT TO authenticated
    USING (rbac.is_member(tenant_id));
CREATE POLICY "clips svc"     ON public.clips FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── pipeline_runs ──────────────────────────────────────────────────────────
-- Written only by the worker/service_role; readable by members (cost ledger).
CREATE POLICY "pruns read"    ON public.pipeline_runs FOR SELECT TO authenticated
    USING (rbac.is_member(tenant_id));
CREATE POLICY "pruns svc"     ON public.pipeline_runs FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── tracks ────────────────────────────────────────────────────────────────
CREATE POLICY "tracks read"   ON public.tracks FOR SELECT TO authenticated
    USING (rbac.is_member(tenant_id));
CREATE POLICY "tracks svc"    ON public.tracks FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── tickets ───────────────────────────────────────────────────────────────
-- Read for any member; field confirm/override requires ticket.review.
CREATE POLICY "tickets read"   ON public.tickets FOR SELECT TO authenticated
    USING (rbac.is_member(tenant_id));
CREATE POLICY "tickets review" ON public.tickets FOR UPDATE TO authenticated
    USING (rbac.has_permission(tenant_id, 'ticket.review'))
    WITH CHECK (rbac.has_permission(tenant_id, 'ticket.review'));
CREATE POLICY "tickets svc"    ON public.tickets FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── anomalies ─────────────────────────────────────────────────────────────
CREATE POLICY "anomalies read" ON public.anomalies FOR SELECT TO authenticated
    USING (rbac.is_member(tenant_id));
CREATE POLICY "anomalies svc"  ON public.anomalies FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── benchmarks ────────────────────────────────────────────────────────────
CREATE POLICY "benchmarks read" ON public.benchmarks FOR SELECT TO authenticated
    USING (rbac.is_member(tenant_id));
CREATE POLICY "benchmarks svc"  ON public.benchmarks FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── reports ───────────────────────────────────────────────────────────────
CREATE POLICY "reports read"   ON public.reports FOR SELECT TO authenticated
    USING (rbac.has_permission(tenant_id, 'report.read'));
CREATE POLICY "reports export" ON public.reports FOR INSERT TO authenticated
    WITH CHECK (rbac.has_permission(tenant_id, 'report.export'));
CREATE POLICY "reports svc"    ON public.reports FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── audit_log ─────────────────────────────────────────────────────────────
-- Append-only: members with report.read may read; no UPDATE/DELETE policy exists,
-- so RLS denies mutation even to authenticated. Inserts come from service_role.
CREATE POLICY "audit read"     ON public.audit_log FOR SELECT TO authenticated
    USING (rbac.has_permission(tenant_id, 'report.read'));
CREATE POLICY "audit svc"      ON public.audit_log FOR INSERT TO service_role
    WITH CHECK (true);
