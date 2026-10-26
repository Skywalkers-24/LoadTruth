-- ═══════════════════════════════════════════════════════════════════════════
-- Base RLS policies for the rbac.* extension tables
-- ═══════════════════════════════════════════════════════════════════════════
-- Adapted from the upstream quickstart (examples/policies/quickstart.sql,
-- BSD-2-Clause — see LICENSE.upstream.md). Changes vs. upstream:
--   • Member/invite management is gated on the LoadTruth 'members.manage'
--     permission (held by county_admin/super_admin) instead of the bare 'owner'
--     role, so tenant admins can invite users and assign roles per PLAN.md §2.
--   • Group creation stays open to any authenticated user (tenant provisioning).
-- The extension ships RLS-enabled with zero policies (deny-all); these are required.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── rbac.groups (tenants) ───────────────────────────────────────────────────
CREATE POLICY "Members read their tenant"
    ON rbac.groups FOR SELECT TO authenticated
    USING (rbac.is_member(id));

CREATE POLICY "Admins update their tenant"
    ON rbac.groups FOR UPDATE TO authenticated
    USING (rbac.has_permission(id, 'event.manage'))
    WITH CHECK (rbac.has_permission(id, 'event.manage'));

-- create_group() is SECURITY INVOKER: an INSERT policy is required to provision.
CREATE POLICY "Authenticated users can create tenants"
    ON rbac.groups FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY "Service role full access to tenants"
    ON rbac.groups FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── rbac.members (memberships) ──────────────────────────────────────────────
CREATE POLICY "Members read co-members"
    ON rbac.members FOR SELECT TO authenticated
    USING (rbac.is_member(group_id));

CREATE POLICY "Admins add members"
    ON rbac.members FOR INSERT TO authenticated
    WITH CHECK (rbac.has_permission(group_id, 'members.manage'));

CREATE POLICY "Admins update member roles"
    ON rbac.members FOR UPDATE TO authenticated
    USING (rbac.has_permission(group_id, 'members.manage'))
    WITH CHECK (rbac.has_permission(group_id, 'members.manage'));

CREATE POLICY "Admins remove members or self-remove"
    ON rbac.members FOR DELETE TO authenticated
    USING (rbac.has_permission(group_id, 'members.manage')
           OR user_id = (SELECT auth.uid()));

CREATE POLICY "Service role full access to members"
    ON rbac.members FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── rbac.invites ────────────────────────────────────────────────────────────
CREATE POLICY "Members read tenant invites"
    ON rbac.invites FOR SELECT TO authenticated
    USING (rbac.is_member(group_id));

CREATE POLICY "Admins create invites"
    ON rbac.invites FOR INSERT TO authenticated
    WITH CHECK (rbac.has_permission(group_id, 'members.manage'));

CREATE POLICY "Admins update invites"
    ON rbac.invites FOR UPDATE TO authenticated
    USING (rbac.has_permission(group_id, 'members.manage'))
    WITH CHECK (rbac.has_permission(group_id, 'members.manage'));

CREATE POLICY "Admins delete invites"
    ON rbac.invites FOR DELETE TO authenticated
    USING (rbac.has_permission(group_id, 'members.manage'));

CREATE POLICY "Service role full access to invites"
    ON rbac.invites FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── rbac.roles / rbac.permissions (admin/migration concern) ─────────────────
CREATE POLICY "Service role manages roles"
    ON rbac.roles FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages permissions"
    ON rbac.permissions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── rbac.member_permissions (per-member overrides) ──────────────────────────
CREATE POLICY "Members read permission overrides"
    ON rbac.member_permissions FOR SELECT TO authenticated
    USING (rbac.is_member(group_id));

CREATE POLICY "Admins manage permission overrides"
    ON rbac.member_permissions FOR ALL TO authenticated
    USING (rbac.has_permission(group_id, 'members.manage'))
    WITH CHECK (rbac.has_permission(group_id, 'members.manage'));

CREATE POLICY "Service role full access to overrides"
    ON rbac.member_permissions FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ─── rbac.user_claims (claims cache; written only by DEFINER triggers) ────────
-- Do NOT add authenticated INSERT/UPDATE here — that would let users forge claims.
CREATE POLICY "authenticator reads all claims"
    ON rbac.user_claims FOR SELECT TO authenticator
    USING (true);

CREATE POLICY "supabase_auth_admin reads all claims"
    ON rbac.user_claims FOR SELECT TO supabase_auth_admin
    USING (true);

CREATE POLICY "service_role full access to claims"
    ON rbac.user_claims FOR ALL TO service_role
    USING (true);

CREATE POLICY "Users read own claims"
    ON rbac.user_claims FOR SELECT TO authenticated
    USING (user_id = (SELECT auth.uid()));
