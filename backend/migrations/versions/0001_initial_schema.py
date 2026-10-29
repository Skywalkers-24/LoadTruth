"""Initial product schema plus Supabase RBAC, policies, and operational tables."""

from __future__ import annotations

import re

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

VENDORED_RBAC_SQL = r"""
CREATE SCHEMA IF NOT EXISTS rbac;

-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase_rbac v5.2.1 — Multi-Tenant RBAC for Supabase
-- ═══════════════════════════════════════════════════════════════════════════════
-- Install in a dedicated schema (e.g. rbac) that is NOT in PostgREST's exposed
-- schemas. Tables are accessed exclusively through RPC functions. Public wrapper
-- functions are opt-in only — run examples/setup/create_public_wrappers.sql after
-- installation to expose them in the public schema for PostgREST RPC discovery.
--
-- SECURITY DEFINER functions (8 total):
--   1. _on_group_created         — trigger: auto-creates membership for group creator (bootstrap)
--   2. accept_invite             — bootstrap: atomically adds membership without prior RLS
--   3. _sync_member_metadata     — trigger, writes user_claims without authenticated INSERT
--   4. _sync_member_permission   — trigger, writes user_claims without authenticated INSERT
--   5. _on_role_definition_change — trigger, writes user_claims without authenticated INSERT
--   6. _validate_roles           — reads rbac.roles (authenticated has no SELECT on roles)
--   7. _validate_permissions     — reads rbac.permissions (authenticated has no SELECT)
--   8. _validate_grantable_roles — reads rbac.roles (authenticated has no SELECT)

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE rbac.groups (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    name       text        NOT NULL,
    metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rbac.members (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    group_id   uuid        NOT NULL,
    user_id    uuid        NOT NULL,
    roles      text[]      NOT NULL DEFAULT '{}'::text[],
    metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rbac.invites (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    group_id    uuid        NOT NULL,
    roles       text[]      NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(roles) > 0),
    invited_by  uuid        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    user_id     uuid,
    accepted_at timestamptz,
    expires_at  timestamptz
);

CREATE TABLE rbac.roles (
    name            text        PRIMARY KEY,
    description     text,
    permissions     text[]      NOT NULL DEFAULT '{}'::text[],
    grantable_roles text[]      NOT NULL DEFAULT '{}'::text[],
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Pre-seed the 'owner' role (used as the default in create_group)
INSERT INTO rbac.roles (name, description, grantable_roles)
VALUES ('owner', 'Group creator with full administrative permissions', ARRAY['*']);

-- Claims cache: one row per user, auto-managed by _sync_member_metadata trigger.
-- ON DELETE CASCADE handles cleanup when a user is deleted from auth.users.
CREATE TABLE rbac.user_claims (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    claims  jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Direct per-member permission overrides. These merge into the claims cache
-- alongside permissions resolved from roles. Additive only — no UPDATE needed.
CREATE TABLE rbac.member_permissions (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    group_id    uuid        NOT NULL,
    user_id     uuid        NOT NULL,
    permission  text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Global permission definitions. Validated by _validate_permissions before use.
CREATE TABLE rbac.permissions (
    name        text        PRIMARY KEY,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES & CONSTRAINTS
-- ─────────────────────────────────────────────────────────────────────────────

-- groups
CREATE UNIQUE INDEX groups_pkey ON rbac.groups USING btree (id);
ALTER TABLE rbac.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY USING INDEX groups_pkey;

-- members
CREATE UNIQUE INDEX members_pkey ON rbac.members USING btree (id);
ALTER TABLE rbac.members
    ADD CONSTRAINT members_pkey PRIMARY KEY USING INDEX members_pkey;

-- Promote unique index to a named constraint so member_permissions can FK-reference it.
CREATE UNIQUE INDEX members_group_user_idx ON rbac.members USING btree (group_id, user_id);
ALTER TABLE rbac.members
    ADD CONSTRAINT members_group_user_uq UNIQUE USING INDEX members_group_user_idx;

CREATE INDEX members_user_id_idx ON rbac.members USING btree (user_id);

-- GIN index for efficient role-membership lookups (WHERE roles @> ARRAY[name]).
-- Critical for _on_role_definition_change() and delete_role() on large member tables.
CREATE INDEX members_roles_gin_idx ON rbac.members USING gin (roles);

ALTER TABLE rbac.members
    ADD CONSTRAINT members_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES rbac.groups (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE rbac.members VALIDATE CONSTRAINT members_group_id_fkey;

ALTER TABLE rbac.members
    ADD CONSTRAINT members_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE rbac.members VALIDATE CONSTRAINT members_user_id_fkey;

-- invites
CREATE UNIQUE INDEX invites_pkey ON rbac.invites USING btree (id);
ALTER TABLE rbac.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY USING INDEX invites_pkey;

ALTER TABLE rbac.invites
    ADD CONSTRAINT invites_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES rbac.groups (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE rbac.invites VALIDATE CONSTRAINT invites_group_id_fkey;

CREATE INDEX invites_group_id_idx ON rbac.invites USING btree (group_id);

ALTER TABLE rbac.invites
    ADD CONSTRAINT invites_invited_by_fkey FOREIGN KEY (invited_by)
    REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE rbac.invites VALIDATE CONSTRAINT invites_invited_by_fkey;

CREATE INDEX invites_invited_by_idx ON rbac.invites USING btree (invited_by);

ALTER TABLE rbac.invites
    ADD CONSTRAINT invites_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE rbac.invites VALIDATE CONSTRAINT invites_user_id_fkey;

CREATE INDEX invites_user_id_idx ON rbac.invites USING btree (user_id);

-- member_permissions
CREATE UNIQUE INDEX member_permissions_pkey ON rbac.member_permissions USING btree (id);
ALTER TABLE rbac.member_permissions
    ADD CONSTRAINT member_permissions_pkey PRIMARY KEY USING INDEX member_permissions_pkey;

-- Enforce uniqueness of (group_id, user_id, permission) — enables idempotent grants
CREATE UNIQUE INDEX member_permissions_group_user_perm_idx
    ON rbac.member_permissions USING btree (group_id, user_id, permission);

-- Index on user_id for efficient claims rebuild lookups
CREATE INDEX member_permissions_user_id_idx
    ON rbac.member_permissions USING btree (user_id);

ALTER TABLE rbac.member_permissions
    ADD CONSTRAINT member_permissions_group_id_fkey FOREIGN KEY (group_id)
    REFERENCES rbac.groups (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE rbac.member_permissions VALIDATE CONSTRAINT member_permissions_group_id_fkey;

ALTER TABLE rbac.member_permissions
    ADD CONSTRAINT member_permissions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE rbac.member_permissions VALIDATE CONSTRAINT member_permissions_user_id_fkey;

-- FK to members (group_id, user_id): CASCADE ensures permission overrides are
-- removed when a member is removed from a group.
ALTER TABLE rbac.member_permissions
    ADD CONSTRAINT member_permissions_member_fkey FOREIGN KEY (group_id, user_id)
    REFERENCES rbac.members (group_id, user_id) ON DELETE CASCADE NOT VALID;
ALTER TABLE rbac.member_permissions VALIDATE CONSTRAINT member_permissions_member_fkey;

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (deny-all by default — consumers add policies)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE rbac.groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.invites            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.user_claims        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac.permissions        ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- INTERNAL FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Replaces moddatetime dependency — inline updated_at trigger
CREATE OR REPLACE FUNCTION rbac._set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- JWT expiry check (internal, underscore-prefixed)
CREATE OR REPLACE FUNCTION rbac._jwt_is_expired()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
BEGIN
    RETURN extract(epoch FROM now()) > coalesce(auth.jwt()->>'exp', '0')::numeric;
END;
$function$;

-- Direct DB read of user claims — reads extension-owned user_claims table.
-- Wraps the subquery so NULL auth.uid() returns '{}' instead of NULL.
CREATE OR REPLACE FUNCTION rbac._get_user_groups()
RETURNS jsonb
LANGUAGE sql
STABLE
-- No SECURITY DEFINER — reads extension-owned user_claims table
SET search_path = rbac
AS $function$
    SELECT coalesce(
        (SELECT claims FROM rbac.user_claims WHERE user_id = auth.uid()),
        '{}'
    )
$function$;

-- PostgREST pre-request hook — reads user_claims on every API request
CREATE OR REPLACE FUNCTION rbac.db_pre_request()
RETURNS void
LANGUAGE plpgsql
VOLATILE
-- No SECURITY DEFINER — reads extension-owned user_claims table
SET search_path = rbac
AS $function$
DECLARE
    _uid   uuid := auth.uid();
    groups jsonb;
BEGIN
    -- anon and other no-user contexts: skip the user_claims SELECT entirely.
    -- anon lacks SELECT on user_claims and would never have claims anyway.
    -- Check current_user as defense-in-depth: auth.uid() reads JWT claims
    -- regardless of role, so a crafted JWT could produce a non-NULL uid for anon.
    IF _uid IS NULL OR current_user = 'anon' THEN
        PERFORM set_config('request.groups'::text, '{}'::text, true);
        RETURN;
    END IF;

    SELECT claims INTO groups FROM rbac.user_claims WHERE user_id = _uid;
    PERFORM set_config('request.groups'::text, coalesce(groups, '{}')::text, true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.db_pre_request() FROM PUBLIC;
-- PostgREST calls db_pre_request AFTER "SET LOCAL ROLE <role>", so it runs as
-- the switched role (authenticated/anon/service_role), not as authenticator.
-- All roles that PostgREST can switch to need EXECUTE.
GRANT EXECUTE ON FUNCTION rbac.db_pre_request() TO authenticator, authenticated, anon, service_role;

-- Validate that all roles in an array exist in the roles table.
-- Raises a descriptive error listing any undefined roles.
CREATE OR REPLACE FUNCTION rbac._validate_roles(p_roles text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = rbac
AS $function$
DECLARE
    _undefined text[];
BEGIN
    IF p_roles IS NULL OR cardinality(p_roles) = 0 THEN
        RETURN;
    END IF;

    SELECT array_agg(r)
    INTO _undefined
    FROM unnest(p_roles) AS r
    WHERE r NOT IN (SELECT name FROM rbac.roles);

    IF _undefined IS NOT NULL THEN
        RAISE EXCEPTION 'Undefined roles: %', array_to_string(_undefined, ', ')
            USING HINT = 'Add these roles to the roles table first';
    END IF;
END;
$function$;

-- Validate that all permission names in an array exist in the permissions table.
-- Raises a descriptive error listing any undefined permissions.
CREATE OR REPLACE FUNCTION rbac._validate_permissions(p_permissions text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = rbac
AS $function$
DECLARE
    _undefined text[];
BEGIN
    IF p_permissions IS NULL OR cardinality(p_permissions) = 0 THEN
        RETURN;
    END IF;

    SELECT array_agg(p)
    INTO _undefined
    FROM unnest(p_permissions) AS p
    WHERE p NOT IN (SELECT name FROM rbac.permissions);

    IF _undefined IS NOT NULL THEN
        RAISE EXCEPTION 'Undefined permissions: %', array_to_string(_undefined, ', ')
            USING HINT = 'Add these permissions to the permissions table first';
    END IF;
END;
$function$;

-- Validate that all role names in grantable_roles exist in the roles table.
-- The wildcard '*' is always valid and skipped during validation.
CREATE OR REPLACE FUNCTION rbac._validate_grantable_roles(p_roles text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = rbac
AS $function$
DECLARE
    _undefined text[];
BEGIN
    IF p_roles IS NULL OR cardinality(p_roles) = 0 THEN
        RETURN;
    END IF;

    SELECT array_agg(r)
    INTO _undefined
    FROM unnest(p_roles) AS r
    WHERE r <> '*' AND r NOT IN (SELECT name FROM rbac.roles);

    IF _undefined IS NOT NULL THEN
        RAISE EXCEPTION 'Undefined roles in grantable_roles: %', array_to_string(_undefined, ', ')
            USING HINT = 'Add these roles to the roles table first';
    END IF;
END;
$function$;

-- Check whether the caller is allowed to assign the requested roles to another
-- member. Prevents privilege escalation — a caller can only grant roles that
-- appear in their own grantable_roles claim for the target group.
-- Bypassed for service_role and postgres session users.
CREATE OR REPLACE FUNCTION rbac._check_role_escalation(p_group_id uuid, p_roles text[])
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
DECLARE
    caller_grantable jsonb;
    bad_roles        text[];
BEGIN
    -- Only enforce when the effective role is 'authenticated'.
    -- Checking both auth.role() and current_user prevents stale JWT context
    -- (e.g. postgres top-level calls after a DO block that set request.jwt.claims)
    -- from triggering enforcement. In production, both are 'authenticated' for
    -- real user requests; service_role and postgres bypass automatically.
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR current_user IS DISTINCT FROM 'authenticated' THEN
        RETURN;
    END IF;

    IF p_roles IS NULL OR cardinality(p_roles) = 0 THEN
        RETURN;
    END IF;

    caller_grantable := get_claims()->p_group_id::text->'grantable_roles';

    IF caller_grantable IS NULL THEN
        RAISE EXCEPTION 'permission denied — caller is not a member of this group'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Wildcard: caller can grant any role
    IF caller_grantable ? '*' THEN
        RETURN;
    END IF;

    -- Find roles the caller is not permitted to grant
    SELECT array_agg(r)
    INTO bad_roles
    FROM unnest(p_roles) AS r
    WHERE NOT (caller_grantable ? r);

    IF bad_roles IS NOT NULL THEN
        RAISE EXCEPTION 'permission denied — role(s) not in caller''s grantable set: %',
            array_to_string(bad_roles, ', ')
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END;
$function$;

-- Check whether the caller is allowed to grant or revoke the specified
-- permission for a member. Prevents permission escalation.
-- Bypassed for service_role and postgres session users.
CREATE OR REPLACE FUNCTION rbac._check_permission_escalation(p_group_id uuid, p_permission text)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
DECLARE
    caller_grantable_perms jsonb;
BEGIN
    -- Only enforce when the effective role is 'authenticated'.
    -- Checking both auth.role() and current_user prevents stale JWT context
    -- from triggering enforcement on postgres top-level calls.
    IF auth.role() IS DISTINCT FROM 'authenticated'
       OR current_user IS DISTINCT FROM 'authenticated' THEN
        RETURN;
    END IF;

    caller_grantable_perms := get_claims()->p_group_id::text->'grantable_permissions';

    IF caller_grantable_perms IS NULL THEN
        RAISE EXCEPTION 'permission denied — caller is not a member of this group'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Wildcard: caller can grant any permission
    IF caller_grantable_perms ? '*' THEN
        RETURN;
    END IF;

    IF NOT (caller_grantable_perms ? p_permission) THEN
        RAISE EXCEPTION 'permission denied — permission "%" not in caller''s grantable set',
            p_permission
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END;
$function$;

-- Build the complete claims JSONB for a user.
-- Returns {"group-uuid": {"roles": [...], "permissions": [...], "grantable_roles": [...], "grantable_permissions": [...]}, ...}
-- Permissions are resolved from roles.permissions[] and member_permissions,
-- deduplicated and sorted. Direct permission overrides merge with role permissions.
-- grantable_roles and grantable_permissions are derived from roles.grantable_roles[].
CREATE OR REPLACE FUNCTION rbac._build_user_claims(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = rbac
AS $function$
    SELECT coalesce(
        jsonb_object_agg(
            sub.gid,
            jsonb_build_object(
                'roles', sub.roles_arr,
                'permissions', sub.perms_arr,
                'grantable_roles', sub.grantable_roles_arr,
                'grantable_permissions', sub.grantable_perms_arr
            )
        ),
        '{}'::jsonb
    )
    FROM (
        SELECT
            m.group_id::text AS gid,
            to_jsonb(m.roles) AS roles_arr,
            -- permissions: union of role permissions + direct overrides, deduplicated
            coalesce(
                to_jsonb(
                    (SELECT array_agg(DISTINCT perm ORDER BY perm)
                     FROM (
                         SELECT unnest(r.permissions) AS perm
                         FROM rbac.roles r
                         WHERE r.name = ANY(m.roles)
                         UNION ALL
                         SELECT mp.permission
                         FROM rbac.member_permissions mp
                         WHERE mp.group_id = m.group_id AND mp.user_id = m.user_id
                     ) AS all_perms)
                ),
                '[]'::jsonb
            ) AS perms_arr,
            -- grantable_roles: union of roles.grantable_roles[] for held roles
            -- if any held role has '*', collapse entire result to ['*']
            -- The EXISTS wildcard check is intentionally duplicated for grantable_roles
            -- and grantable_permissions below — the optimizer deduplicates identical
            -- subqueries; explicit duplication keeps each CASE branch self-contained.
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM rbac.roles r
                    WHERE r.name = ANY(m.roles)
                      AND '*' = ANY(r.grantable_roles)
                ) THEN '["*"]'::jsonb
                ELSE coalesce(
                    to_jsonb(
                        (SELECT array_agg(DISTINCT gr ORDER BY gr)
                         FROM (
                             SELECT unnest(r.grantable_roles) AS gr
                             FROM rbac.roles r
                             WHERE r.name = ANY(m.roles)
                         ) t
                         WHERE gr <> '*')
                    ),
                    '[]'::jsonb
                )
            END AS grantable_roles_arr,
            -- grantable_permissions: if wildcard, return ['*']
            -- else union of permissions[] for all roles named in grantable_roles
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM rbac.roles r
                    WHERE r.name = ANY(m.roles)
                      AND '*' = ANY(r.grantable_roles)
                ) THEN '["*"]'::jsonb
                ELSE coalesce(
                    to_jsonb(
                        (SELECT array_agg(DISTINCT gp ORDER BY gp)
                         FROM (
                             SELECT unnest(r2.permissions) AS gp
                             FROM rbac.roles r
                             JOIN rbac.roles r2
                                 ON r2.name = ANY(r.grantable_roles)
                                 AND r2.name <> '*'
                             WHERE r.name = ANY(m.roles)
                         ) AS grantable_perms)
                    ),
                    '[]'::jsonb
                )
            END AS grantable_perms_arr
        FROM rbac.members m
        WHERE m.user_id = p_user_id
    ) sub
$function$;

-- Trigger function: rebuild user's entire claims from members table
-- Fires on INSERT/UPDATE/DELETE on members.
-- SECURITY DEFINER so it can write to user_claims regardless of the calling role.
-- Trigger functions (RETURNS trigger) cannot be called directly via RPC or REST.
CREATE OR REPLACE FUNCTION rbac._sync_member_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rbac
AS $function$
DECLARE
    _user_id     uuid;
    _user_id_old uuid;
    _group_id     uuid;
    _group_id_old uuid;
    _new_groups  jsonb;
BEGIN
    _user_id     := coalesce(NEW.user_id, OLD.user_id);
    _user_id_old := coalesce(OLD.user_id, NEW.user_id);
    _group_id     := coalesce(NEW.group_id, OLD.group_id);
    _group_id_old := coalesce(OLD.group_id, NEW.group_id);

    -- Block changing user_id or group_id
    IF TG_OP = 'UPDATE' THEN
        IF _user_id IS DISTINCT FROM _user_id_old OR _group_id IS DISTINCT FROM _group_id_old THEN
            RAISE EXCEPTION 'Changing user_id or group_id is not allowed';
        END IF;
    END IF;

    -- Rebuild full claims for this user
    SELECT _build_user_claims(_user_id) INTO _new_groups;

    -- Upsert into user_claims. Nested block catches only the expected FK violation
    -- (concurrent auth.users deletion during upsert), not unexpected errors elsewhere.
    BEGIN
        INSERT INTO rbac.user_claims (user_id, claims)
        VALUES (_user_id, _new_groups)
        ON CONFLICT (user_id) DO UPDATE SET claims = EXCLUDED.claims;
    EXCEPTION WHEN foreign_key_violation THEN
        -- user_id no longer exists in auth.users (deleted concurrently) — skip silently
        NULL;
    END;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$function$;

-- Trigger function: rebuild claims when a direct member permission is added or removed.
-- Fires on INSERT/DELETE on member_permissions.
-- SECURITY DEFINER so it can write to user_claims regardless of the calling role.
-- Trigger functions (RETURNS trigger) cannot be called directly via RPC or REST.
CREATE OR REPLACE FUNCTION rbac._sync_member_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rbac
AS $function$
DECLARE
    _user_id    uuid;
    _new_groups jsonb;
BEGIN
    _user_id := coalesce(NEW.user_id, OLD.user_id);

    -- Rebuild full claims for this user (includes remaining direct overrides)
    SELECT _build_user_claims(_user_id) INTO _new_groups;

    -- Nested block catches only the expected FK violation (concurrent user deletion).
    BEGIN
        INSERT INTO rbac.user_claims (user_id, claims)
        VALUES (_user_id, _new_groups)
        ON CONFLICT (user_id) DO UPDATE SET claims = EXCLUDED.claims;
    EXCEPTION WHEN foreign_key_violation THEN
        -- user_id no longer exists in auth.users (deleted concurrently) — skip silently
        NULL;
    END;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$function$;

-- Trigger function: rebuild claims for all users holding a role whose
-- permissions or grantable_roles column was changed, and for users who hold
-- roles that reference the changed role in their own grantable_roles.
-- Fires on UPDATE of roles.
-- SECURITY DEFINER so it can write to user_claims regardless of the calling role.
-- Trigger functions (RETURNS trigger) cannot be called directly via RPC or REST.
CREATE OR REPLACE FUNCTION rbac._on_role_definition_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rbac
AS $function$
BEGIN
    -- Batch rebuild: single INSERT...ON CONFLICT replaces the previous per-row loop,
    -- reducing lock hold time for large membership tables. Pre-filtering on auth.users
    -- avoids FK violations from concurrent user deletions without needing an exception
    -- handler that could inadvertently swallow unexpected errors.
    INSERT INTO rbac.user_claims (user_id, claims)
    SELECT u.user_id, _build_user_claims(u.user_id)
    FROM (
        SELECT DISTINCT m.user_id
        FROM rbac.members m
        -- Use array containment (@>) so PostgreSQL can use members_roles_gin_idx.
        WHERE m.roles @> ARRAY[NEW.name]           -- direct holders of changed role
           OR EXISTS (
               SELECT 1 FROM rbac.roles r2
               -- Same @> pattern keeps this indirect path GIN-friendly as well.
               WHERE m.roles @> ARRAY[r2.name]
                 AND NEW.name = ANY(r2.grantable_roles)
           )                                       -- indirect: holds a role whose grantable_roles lists the changed role
    ) u
    WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = u.user_id)
    ON CONFLICT (user_id) DO UPDATE SET claims = EXCLUDED.claims;

    RETURN NEW;
END;
$function$;

-- Trigger function: auto-create membership row for group creator after INSERT on groups.
-- SECURITY DEFINER so it can INSERT into members even though the caller has no prior
-- membership (and therefore cannot pass the members INSERT RLS policy).
-- Trigger functions (RETURNS trigger) cannot be called directly via RPC or REST.
-- Skips when auth.uid() is NULL (service_role / migration INSERTs).
CREATE OR REPLACE FUNCTION rbac._on_group_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rbac
AS $function$
DECLARE
    _user_id uuid;
    _roles   text[];
BEGIN
    _user_id := auth.uid();
    IF _user_id IS NULL THEN
        RETURN NEW;  -- service_role / migration insert — skip
    END IF;

    BEGIN
        _roles := current_setting('rbac.creator_roles')::text[];
    EXCEPTION WHEN OTHERS THEN
        _roles := ARRAY['owner'];
    END;

    -- Validate roles exist (guards direct INSERT path where create_group didn't run)
    PERFORM _validate_roles(_roles);

    INSERT INTO rbac.members (group_id, user_id, roles)
    VALUES (NEW.id, _user_id, ARRAY(SELECT DISTINCT unnest(_roles) ORDER BY 1));

    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac._on_group_created() FROM PUBLIC;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS / CLAIMS HELPERS
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns current user's group/role claims
CREATE OR REPLACE FUNCTION rbac.get_claims()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = rbac
AS $function$
    SELECT coalesce(
        nullif(current_setting('request.groups', true), '')::jsonb,
        _get_user_groups()
    )::jsonb
$function$;

REVOKE EXECUTE ON FUNCTION rbac.get_claims() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.get_claims() TO authenticated, anon, service_role;

-- Check if user has a specific role in a group
CREATE OR REPLACE FUNCTION rbac.has_role(group_id uuid, role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
DECLARE
    auth_role text := auth.role();
    retval bool;
BEGIN
    IF auth_role = 'authenticated' THEN
        IF _jwt_is_expired() THEN
            RAISE EXCEPTION 'invalid_jwt' USING HINT = 'jwt is expired or missing';
        END IF;
        SELECT coalesce(get_claims()->group_id::text->'roles' ? role, false) INTO retval;
        RETURN retval;
    ELSIF auth_role = 'anon' THEN
        RETURN false;
    ELSE
        IF session_user = 'postgres' OR auth_role = 'service_role' THEN
            RETURN true;
        ELSE
            RETURN false;
        END IF;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.has_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.has_role(uuid, text) TO authenticated, anon, service_role;

-- Check if user is a member of a group (any role)
CREATE OR REPLACE FUNCTION rbac.is_member(group_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
DECLARE
    auth_role text := auth.role();
    retval bool;
BEGIN
    IF auth_role = 'authenticated' THEN
        IF _jwt_is_expired() THEN
            RAISE EXCEPTION 'invalid_jwt' USING HINT = 'jwt is expired or missing';
        END IF;
        SELECT coalesce(get_claims() ? group_id::text, false) INTO retval;
        RETURN retval;
    ELSIF auth_role = 'anon' THEN
        RETURN false;
    ELSE
        IF session_user = 'postgres' OR auth_role = 'service_role' THEN
            RETURN true;
        ELSE
            RETURN false;
        END IF;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.is_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.is_member(uuid) TO authenticated, anon, service_role;

-- Check if user has ANY of the listed roles in a group
CREATE OR REPLACE FUNCTION rbac.has_any_role(group_id uuid, roles text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
DECLARE
    auth_role text := auth.role();
    retval bool;
BEGIN
    IF auth_role = 'authenticated' THEN
        IF _jwt_is_expired() THEN
            RAISE EXCEPTION 'invalid_jwt' USING HINT = 'jwt is expired or missing';
        END IF;
        SELECT coalesce(get_claims()->group_id::text->'roles' ?| roles, false) INTO retval;
        RETURN retval;
    ELSIF auth_role = 'anon' THEN
        RETURN false;
    ELSE
        IF session_user = 'postgres' OR auth_role = 'service_role' THEN
            RETURN true;
        ELSE
            RETURN false;
        END IF;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.has_any_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.has_any_role(uuid, text[]) TO authenticated, anon, service_role;

-- Check if user has ALL of the listed roles in a group
CREATE OR REPLACE FUNCTION rbac.has_all_roles(group_id uuid, roles text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
DECLARE
    auth_role text := auth.role();
    retval bool;
BEGIN
    IF auth_role = 'authenticated' THEN
        IF _jwt_is_expired() THEN
            RAISE EXCEPTION 'invalid_jwt' USING HINT = 'jwt is expired or missing';
        END IF;
        SELECT coalesce(get_claims()->group_id::text->'roles' ?& roles, false) INTO retval;
        RETURN retval;
    ELSIF auth_role = 'anon' THEN
        RETURN false;
    ELSE
        IF session_user = 'postgres' OR auth_role = 'service_role' THEN
            RETURN true;
        ELSE
            RETURN false;
        END IF;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.has_all_roles(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.has_all_roles(uuid, text[]) TO authenticated, anon, service_role;

-- Check if user has a specific resolved permission in a group
CREATE OR REPLACE FUNCTION rbac.has_permission(group_id uuid, permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
DECLARE
    auth_role text := auth.role();
    retval bool;
BEGIN
    IF auth_role = 'authenticated' THEN
        IF _jwt_is_expired() THEN
            RAISE EXCEPTION 'invalid_jwt' USING HINT = 'jwt is expired or missing';
        END IF;
        SELECT coalesce(get_claims()->group_id::text->'permissions' ? permission, false) INTO retval;
        RETURN retval;
    ELSIF auth_role = 'anon' THEN
        RETURN false;
    ELSE
        IF session_user = 'postgres' OR auth_role = 'service_role' THEN
            RETURN true;
        ELSE
            RETURN false;
        END IF;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.has_permission(uuid, text) TO authenticated, anon, service_role;

-- Check if user has ANY of the listed permissions in a group
CREATE OR REPLACE FUNCTION rbac.has_any_permission(group_id uuid, permissions text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
DECLARE
    auth_role text := auth.role();
    retval bool;
BEGIN
    IF auth_role = 'authenticated' THEN
        IF _jwt_is_expired() THEN
            RAISE EXCEPTION 'invalid_jwt' USING HINT = 'jwt is expired or missing';
        END IF;
        SELECT coalesce(get_claims()->group_id::text->'permissions' ?| permissions, false) INTO retval;
        RETURN retval;
    ELSIF auth_role = 'anon' THEN
        RETURN false;
    ELSE
        IF session_user = 'postgres' OR auth_role = 'service_role' THEN
            RETURN true;
        ELSE
            RETURN false;
        END IF;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.has_any_permission(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.has_any_permission(uuid, text[]) TO authenticated, anon, service_role;

-- Check if user has ALL of the listed permissions in a group
CREATE OR REPLACE FUNCTION rbac.has_all_permissions(group_id uuid, permissions text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
DECLARE
    auth_role text := auth.role();
    retval bool;
BEGIN
    IF auth_role = 'authenticated' THEN
        IF _jwt_is_expired() THEN
            RAISE EXCEPTION 'invalid_jwt' USING HINT = 'jwt is expired or missing';
        END IF;
        SELECT coalesce(get_claims()->group_id::text->'permissions' ?& permissions, false) INTO retval;
        RETURN retval;
    ELSIF auth_role = 'anon' THEN
        RETURN false;
    ELSE
        IF session_user = 'postgres' OR auth_role = 'service_role' THEN
            RETURN true;
        ELSE
            RETURN false;
        END IF;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.has_all_permissions(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.has_all_permissions(uuid, text[]) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- MANAGEMENT RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- Create a group and add the caller as a member with creator_roles.
-- SECURITY INVOKER — INSERT into groups is subject to RLS. Add an INSERT policy on
-- rbac.groups to allow group creation (see examples/policies/quickstart.sql).
-- The _on_group_created AFTER INSERT trigger (SECURITY DEFINER) handles membership.
CREATE OR REPLACE FUNCTION rbac.create_group(
    p_name          text,
    p_metadata      jsonb  DEFAULT '{}'::jsonb,
    p_creator_roles text[] DEFAULT ARRAY['owner']
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
DECLARE
    _user_id  uuid := auth.uid();
    _group_id uuid := gen_random_uuid();
BEGIN
    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    PERFORM _validate_roles(p_creator_roles);

    -- Store creator roles for the _on_group_created trigger.
    PERFORM set_config('rbac.creator_roles',
        ARRAY(SELECT DISTINCT unnest(p_creator_roles) ORDER BY 1)::text,
        true);

    -- Pre-generate the UUID to avoid RETURNING, which would require passing the
    -- SELECT policy (is_member check) before the trigger creates the membership.
    INSERT INTO rbac.groups (id, name, metadata)
    VALUES (_group_id, p_name, p_metadata);

    RETURN _group_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.create_group(text, jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.create_group(text, jsonb, text[]) TO authenticated, service_role;

-- Delete a group. SECURITY INVOKER — RLS enforced.
CREATE OR REPLACE FUNCTION rbac.delete_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    DELETE FROM rbac.groups WHERE id = p_group_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Group not found or not authorized';
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.delete_group(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.delete_group(uuid) TO authenticated, service_role;

-- Add a member to a group (or merge roles if already a member).
-- SECURITY INVOKER — RLS on members enforced.
CREATE OR REPLACE FUNCTION rbac.add_member(
    p_group_id uuid,
    p_user_id  uuid,
    p_roles    text[] DEFAULT '{}'::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
DECLARE
    _member_id uuid;
BEGIN
    PERFORM _validate_roles(p_roles);
    PERFORM _check_role_escalation(p_group_id, p_roles);

    INSERT INTO rbac.members (group_id, user_id, roles)
    VALUES (p_group_id, p_user_id, ARRAY(SELECT DISTINCT unnest(p_roles) ORDER BY 1))
    ON CONFLICT (group_id, user_id)
    DO UPDATE SET roles = (
        SELECT array_agg(DISTINCT r ORDER BY r)
        FROM unnest(members.roles || EXCLUDED.roles) AS r
    )
    RETURNING id INTO _member_id;

    RETURN _member_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.add_member(uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.add_member(uuid, uuid, text[]) TO authenticated, service_role;

-- Remove a member from a group. SECURITY INVOKER — RLS enforced.
CREATE OR REPLACE FUNCTION rbac.remove_member(p_group_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    DELETE FROM rbac.members
    WHERE group_id = p_group_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member not found or not authorized';
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.remove_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.remove_member(uuid, uuid) TO authenticated, service_role;

-- Replace the roles array for a member. SECURITY INVOKER — RLS enforced.
CREATE OR REPLACE FUNCTION rbac.update_member_roles(
    p_group_id uuid,
    p_user_id  uuid,
    p_roles    text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    PERFORM _validate_roles(p_roles);
    PERFORM _check_role_escalation(p_group_id, p_roles);

    UPDATE rbac.members
    SET roles = ARRAY(
        SELECT DISTINCT r
        FROM unnest(coalesce(p_roles, '{}'::text[])) AS r
        ORDER BY 1
    )
    WHERE group_id = p_group_id AND user_id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member not found or not authorized';
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.update_member_roles(uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.update_member_roles(uuid, uuid, text[]) TO authenticated, service_role;

-- List members of a group. SECURITY INVOKER — RLS enforced.
CREATE OR REPLACE FUNCTION rbac.list_members(p_group_id uuid)
RETURNS TABLE(id uuid, user_id uuid, roles text[], metadata jsonb, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
BEGIN
    RETURN QUERY
    SELECT m.id, m.user_id, m.roles, m.metadata, m.created_at
    FROM rbac.members m
    WHERE m.group_id = p_group_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.list_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.list_members(uuid) TO authenticated, service_role;

-- Accept an invite. SECURITY DEFINER — bypasses RLS for atomic acceptance.
CREATE OR REPLACE FUNCTION rbac.accept_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = rbac
AS $function$
DECLARE
    _user_id uuid := auth.uid();
    _invite  record;
BEGIN
    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock the invite row to prevent concurrent acceptance races
    SELECT * INTO _invite FROM rbac.invites
    WHERE id = p_invite_id
      AND user_id IS NULL
      AND accepted_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invite not found, already used, or expired';
    END IF;

    -- Validate that the roles on this invite still exist
    PERFORM _validate_roles(_invite.roles);

    -- Mark invite as accepted
    UPDATE rbac.invites
    SET user_id = _user_id, accepted_at = now()
    WHERE id = p_invite_id;

    -- Upsert membership — merge roles if already a member
    INSERT INTO rbac.members (group_id, user_id, roles)
    VALUES (
        _invite.group_id,
        _user_id,
        ARRAY(
            SELECT DISTINCT r
            FROM unnest(_invite.roles) AS r
            ORDER BY 1
        )
    )
    ON CONFLICT (group_id, user_id)
    DO UPDATE SET roles = (
        SELECT array_agg(DISTINCT r ORDER BY r)
        FROM unnest(members.roles || EXCLUDED.roles) AS r
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.accept_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.accept_invite(uuid) TO authenticated, service_role;

-- Create an invite for a group. SECURITY INVOKER — RLS enforced.
-- The INSERT is subject to the app-author's RLS policy on invites, which controls
-- who may create invites (e.g. must have a specific role or permission in the group).
CREATE OR REPLACE FUNCTION rbac.create_invite(
    p_group_id   uuid,
    p_roles      text[],
    p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
DECLARE
    _user_id   uuid := auth.uid();
    _invite_id uuid;
BEGIN
    IF _user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    PERFORM _validate_roles(p_roles);
    PERFORM _check_role_escalation(p_group_id, p_roles);

    INSERT INTO rbac.invites (group_id, roles, invited_by, expires_at)
    VALUES (
        p_group_id,
        ARRAY(
            SELECT DISTINCT r
            FROM unnest(coalesce(p_roles, '{}'::text[])) AS r
            ORDER BY 1
        ),
        _user_id,
        p_expires_at
    )
    RETURNING id INTO _invite_id;

    RETURN _invite_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.create_invite(uuid, text[], timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.create_invite(uuid, text[], timestamptz) TO authenticated, service_role;

-- Delete an invite. SECURITY INVOKER — RLS enforced.
-- Raises if the invite is not found or not authorized.
CREATE OR REPLACE FUNCTION rbac.delete_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    DELETE FROM rbac.invites WHERE id = p_invite_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invite not found or not authorized';
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.delete_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.delete_invite(uuid) TO authenticated, service_role;

-- Grant a direct permission override to a member. SECURITY INVOKER — RLS enforced.
-- Idempotent: ON CONFLICT DO NOTHING prevents duplicates.
--
-- Defense-in-depth: is_member() guard runs before RLS, ensuring authenticated callers
-- cannot write to a group they are not members of even if a consumer RLS policy is
-- misconfigured. is_member() returns true for postgres/service_role so backend callers
-- are unaffected. The downstream FK (member_permissions → members) also prevents
-- granting permissions to users who are not members of the target group.
CREATE OR REPLACE FUNCTION rbac.grant_member_permission(
    p_group_id   uuid,
    p_user_id    uuid,
    p_permission text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    -- Caller must be a member of the target group.
    IF NOT is_member(p_group_id) THEN
        RAISE EXCEPTION 'permission denied — caller is not a member of the target group'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Reject empty permission strings.
    IF trim(coalesce(p_permission, '')) = '' THEN
        RAISE EXCEPTION 'permission must not be empty'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    PERFORM _validate_permissions(ARRAY[p_permission]);
    PERFORM _check_permission_escalation(p_group_id, p_permission);

    INSERT INTO rbac.member_permissions (group_id, user_id, permission)
    VALUES (p_group_id, p_user_id, p_permission)
    ON CONFLICT (group_id, user_id, permission) DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.grant_member_permission(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.grant_member_permission(uuid, uuid, text) TO authenticated, service_role;

-- Revoke a direct permission override from a member. SECURITY INVOKER — RLS enforced.
-- Raises if the override does not exist.
CREATE OR REPLACE FUNCTION rbac.revoke_member_permission(
    p_group_id   uuid,
    p_user_id    uuid,
    p_permission text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    -- Caller must be a member of the target group.
    IF NOT is_member(p_group_id) THEN
        RAISE EXCEPTION 'permission denied — caller is not a member of the target group'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Reject empty permission strings.
    IF trim(coalesce(p_permission, '')) = '' THEN
        RAISE EXCEPTION 'permission must not be empty'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    PERFORM _check_permission_escalation(p_group_id, p_permission);

    DELETE FROM rbac.member_permissions
    WHERE group_id = p_group_id AND user_id = p_user_id AND permission = p_permission;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permission override not found for member';
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.revoke_member_permission(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.revoke_member_permission(uuid, uuid, text) TO authenticated, service_role;

-- List direct permission overrides for a group, optionally filtered by user.
-- SECURITY INVOKER — RLS enforced.
CREATE OR REPLACE FUNCTION rbac.list_member_permissions(
    p_group_id uuid,
    p_user_id  uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, permission text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
BEGIN
    RETURN QUERY
    SELECT mp.user_id, mp.permission, mp.created_at
    FROM rbac.member_permissions mp
    WHERE mp.group_id = p_group_id
      AND (p_user_id IS NULL OR mp.user_id = p_user_id)
    ORDER BY mp.user_id, mp.permission;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.list_member_permissions(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.list_member_permissions(uuid, uuid) TO authenticated, service_role;

-- Create a role definition. SECURITY INVOKER — service_role only (app-author operation).
CREATE OR REPLACE FUNCTION rbac.create_role(
    p_name            text,
    p_description     text   DEFAULT NULL,
    p_permissions     text[] DEFAULT '{}'::text[],
    p_grantable_roles text[] DEFAULT '{}'::text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    PERFORM _validate_permissions(p_permissions);
    PERFORM _validate_grantable_roles(p_grantable_roles);
    INSERT INTO rbac.roles (name, description, permissions, grantable_roles)
    VALUES (p_name, p_description, coalesce(p_permissions, '{}'::text[]), coalesce(p_grantable_roles, '{}'::text[]));
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.create_role(text, text, text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.create_role(text, text, text[], text[]) TO service_role;

-- Delete a role definition. Refuses if any member uses this role or if other
-- roles reference it in their grantable_roles.
-- SECURITY INVOKER — service_role only (app-author operation).
CREATE OR REPLACE FUNCTION rbac.delete_role(p_name text)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    -- Check if any member has this role
    IF EXISTS (
        -- Use @> to match the GIN index on members.roles.
        SELECT 1 FROM rbac.members WHERE roles @> ARRAY[p_name]
    ) THEN
        RAISE EXCEPTION 'Role "%" is in use by one or more members', p_name
            USING HINT = 'Remove this role from all members before deleting it';
    END IF;

    -- Check if any other role references this role in grantable_roles
    IF EXISTS (
        SELECT 1 FROM rbac.roles WHERE p_name = ANY(grantable_roles)
    ) THEN
        RAISE EXCEPTION 'Role "%" is referenced in grantable_roles by other roles', p_name
            USING HINT = 'Remove this role from grantable_roles of other roles before deleting it';
    END IF;

    DELETE FROM rbac.roles WHERE name = p_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role "%" not found or not authorized', p_name;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.delete_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.delete_role(text) TO service_role;

-- List all role definitions. SECURITY INVOKER — service_role only.
CREATE OR REPLACE FUNCTION rbac.list_roles()
RETURNS TABLE(name text, description text, permissions text[], grantable_roles text[], created_at timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
BEGIN
    RETURN QUERY
    SELECT r.name, r.description, r.permissions, r.grantable_roles, r.created_at
    FROM rbac.roles r
    ORDER BY r.name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.list_roles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.list_roles() TO service_role;

-- Replace all permissions for a role. service_role only (app-author operation).
-- Trigger on roles handles claims cache rebuild for all affected members.
CREATE OR REPLACE FUNCTION rbac.set_role_permissions(
    p_role_name   text,
    p_permissions text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM rbac.roles WHERE name = p_role_name) THEN
        RAISE EXCEPTION 'Role "%" not found', p_role_name;
    END IF;

    PERFORM _validate_permissions(p_permissions);

    UPDATE rbac.roles
    SET permissions = coalesce(p_permissions, '{}'::text[])
    WHERE name = p_role_name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.set_role_permissions(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.set_role_permissions(text, text[]) TO service_role;

-- Add a single permission to a role (idempotent). service_role only.
CREATE OR REPLACE FUNCTION rbac.grant_permission(
    p_role_name  text,
    p_permission text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    PERFORM _validate_permissions(ARRAY[p_permission]);

    UPDATE rbac.roles
    SET permissions = (
        SELECT array_agg(DISTINCT p ORDER BY p)
        FROM unnest(permissions || ARRAY[p_permission]) AS p
    )
    WHERE name = p_role_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role "%" not found', p_role_name;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.grant_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.grant_permission(text, text) TO service_role;

-- Remove a single permission from a role (no-op if not present). service_role only.
CREATE OR REPLACE FUNCTION rbac.revoke_permission(
    p_role_name  text,
    p_permission text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    UPDATE rbac.roles
    SET permissions = array_remove(permissions, p_permission)
    WHERE name = p_role_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Role "%" not found', p_role_name;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.revoke_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.revoke_permission(text, text) TO service_role;

-- List permissions for one or all roles. service_role only.
CREATE OR REPLACE FUNCTION rbac.list_role_permissions(p_role_name text DEFAULT NULL)
RETURNS TABLE(role_name text, permission text)
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
BEGIN
    RETURN QUERY
    SELECT r.name AS role_name, perm AS permission
    FROM rbac.roles r,
         unnest(r.permissions) AS perm
    WHERE p_role_name IS NULL OR r.name = p_role_name
    ORDER BY r.name, perm;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.list_role_permissions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.list_role_permissions(text) TO service_role;

-- Replace the grantable_roles for a role. service_role only (app-author operation).
-- Trigger on roles handles claims cache rebuild for all affected members.
CREATE OR REPLACE FUNCTION rbac.set_role_grantable_roles(
    p_role_name       text,
    p_grantable_roles text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM rbac.roles WHERE name = p_role_name) THEN
        RAISE EXCEPTION 'Role "%" not found', p_role_name;
    END IF;

    PERFORM _validate_grantable_roles(p_grantable_roles);

    UPDATE rbac.roles
    SET grantable_roles = coalesce(p_grantable_roles, '{}'::text[])
    WHERE name = p_role_name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.set_role_grantable_roles(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.set_role_grantable_roles(text, text[]) TO service_role;

-- Create a permission definition. service_role only (app-author operation).
CREATE OR REPLACE FUNCTION rbac.create_permission(
    p_name        text,
    p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    INSERT INTO rbac.permissions (name, description) VALUES (p_name, p_description);
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.create_permission(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.create_permission(text, text) TO service_role;

-- Delete a permission definition. Refuses if any role or member uses this permission.
-- service_role only (app-author operation).
CREATE OR REPLACE FUNCTION rbac.delete_permission(p_name text)
RETURNS void
LANGUAGE plpgsql
SET search_path = rbac
AS $function$
BEGIN
    -- Check if any role has this permission
    IF EXISTS (
        SELECT 1 FROM rbac.roles WHERE p_name = ANY(permissions)
    ) THEN
        RAISE EXCEPTION 'Permission "%" is in use by one or more roles', p_name
            USING HINT = 'Remove this permission from all roles before deleting it';
    END IF;

    -- Check if any member has this direct permission override
    IF EXISTS (
        SELECT 1 FROM rbac.member_permissions WHERE permission = p_name
    ) THEN
        RAISE EXCEPTION 'Permission "%" is in use by one or more member permission overrides', p_name
            USING HINT = 'Revoke this permission from all members before deleting it';
    END IF;

    DELETE FROM rbac.permissions WHERE name = p_name;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permission "%" not found', p_name;
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.delete_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.delete_permission(text) TO service_role;

-- List all permission definitions. service_role only.
CREATE OR REPLACE FUNCTION rbac.list_permissions()
RETURNS TABLE(name text, description text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SET search_path = rbac
AS $function$
BEGIN
    RETURN QUERY
    SELECT p.name, p.description, p.created_at
    FROM rbac.permissions p
    ORDER BY p.name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.list_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.list_permissions() TO service_role;

-- Supabase Auth Hook: injects group claims into JWT at token creation time.
-- Register in config.toml: [auth.hook.custom_access_token]
-- uri = "pg-functions://postgres/public/custom_access_token_hook"
CREATE OR REPLACE FUNCTION rbac.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
-- No SECURITY DEFINER — reads extension-owned user_claims table
SET search_path = rbac
AS $function$
DECLARE
    claims      jsonb;
    user_groups jsonb;
BEGIN
    claims := event->'claims';

    SELECT uc.claims INTO user_groups
    FROM rbac.user_claims uc
    WHERE uc.user_id = (event->>'user_id')::uuid;

    -- Merge groups into app_metadata in the JWT claims
    claims := jsonb_set(
        claims,
        '{app_metadata}',
        coalesce(claims->'app_metadata', '{}'::jsonb)
            || jsonb_build_object('groups', coalesce(user_groups, '{}'::jsonb))
    );

    event := jsonb_set(event, '{claims}', claims);
    RETURN event;
END;
$function$;

REVOKE EXECUTE ON FUNCTION rbac.custom_access_token_hook(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- ─────────────────────────────────────────────────────────────────────────────
-- GRANTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Schema access for SECURITY INVOKER RPCs
GRANT USAGE ON SCHEMA rbac TO authenticated, anon, service_role;
-- authenticator needs schema access for db_pre_request() (now SECURITY INVOKER)
-- supabase_auth_admin needs schema access for custom_access_token_hook()
GRANT USAGE ON SCHEMA rbac TO authenticator, supabase_auth_admin;

-- Table DML grants (RLS controls which rows)
GRANT SELECT, INSERT, UPDATE, DELETE ON rbac.groups  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rbac.members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON rbac.invites TO authenticated;
-- user_claims: SELECT is needed for _get_user_groups() fallback (Storage RLS path).
-- No INSERT/UPDATE for authenticated — the three trigger functions that write to
-- user_claims are now SECURITY DEFINER and run as the function owner (postgres),
-- not as the calling role. Removing INSERT/UPDATE closes the claims forgery vector.
GRANT SELECT ON rbac.user_claims TO authenticated;
-- authenticator/service_role need SELECT for db_pre_request() (SECURITY INVOKER;
-- PostgREST calls it AFTER "SET LOCAL ROLE", so it runs as the switched role).
-- anon is NOT granted SELECT — db_pre_request() short-circuits for NULL auth.uid().
GRANT SELECT ON rbac.user_claims TO authenticator, service_role;
-- supabase_auth_admin needs SELECT for custom_access_token_hook()
GRANT SELECT ON rbac.user_claims TO supabase_auth_admin;

-- member_permissions: authenticated can read, insert, and delete overrides.
-- No UPDATE needed — rows are inserted or deleted, not modified.
GRANT SELECT, INSERT, DELETE ON rbac.member_permissions TO authenticated;

-- permissions table: service_role only — permission definitions are admin-only
GRANT ALL ON rbac.permissions TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA rbac TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- INTERNAL HELPER FUNCTION LOCKS
-- ─────────────────────────────────────────────────────────────────────────────
-- Revoke PUBLIC execute on all internal _-prefixed helpers. These are not part
-- of the public API and should only be called from within the extension itself.

REVOKE EXECUTE ON FUNCTION rbac._build_user_claims(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._get_user_groups() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._validate_roles(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._validate_permissions(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._validate_grantable_roles(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._check_role_escalation(uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._check_permission_escalation(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._jwt_is_expired() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._set_updated_at() FROM PUBLIC;
-- Trigger-only functions: no EXECUTE for any non-superuser role
REVOKE EXECUTE ON FUNCTION rbac._on_group_created() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._sync_member_metadata() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._sync_member_permission() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION rbac._on_role_definition_change() FROM PUBLIC;

-- _get_user_groups: called by get_claims() INVOKER (Storage RLS fallback path)
GRANT EXECUTE ON FUNCTION rbac._get_user_groups() TO authenticated, service_role;
-- _jwt_is_expired: called by RLS helpers (has_role, is_member, etc.) which are INVOKER
GRANT EXECUTE ON FUNCTION rbac._jwt_is_expired() TO authenticated, anon, service_role;
-- _check_role_escalation/_check_permission_escalation: called by INVOKER management RPCs
GRANT EXECUTE ON FUNCTION rbac._check_role_escalation(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rbac._check_permission_escalation(uuid, text) TO authenticated, service_role;
-- _validate_roles/_validate_permissions/_validate_grantable_roles are SECURITY DEFINER
-- (they read rbac.roles/rbac.permissions which authenticated cannot SELECT directly).
-- authenticated still needs EXECUTE to call them from INVOKER management RPCs.
GRANT EXECUTE ON FUNCTION rbac._validate_roles(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rbac._validate_permissions(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION rbac._validate_grantable_roles(text[]) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER handle_updated_at
    BEFORE UPDATE ON rbac.groups
    FOR EACH ROW EXECUTE FUNCTION rbac._set_updated_at();

CREATE TRIGGER on_group_created
    AFTER INSERT ON rbac.groups
    FOR EACH ROW EXECUTE FUNCTION rbac._on_group_created();

CREATE TRIGGER handle_updated_at
    BEFORE UPDATE ON rbac.members
    FOR EACH ROW EXECUTE FUNCTION rbac._set_updated_at();

CREATE TRIGGER on_change_sync_member_metadata
    AFTER INSERT OR DELETE OR UPDATE ON rbac.members
    FOR EACH ROW EXECUTE FUNCTION rbac._sync_member_metadata();

CREATE TRIGGER on_role_definition_change
    AFTER UPDATE ON rbac.roles
    FOR EACH ROW
    WHEN (OLD.permissions IS DISTINCT FROM NEW.permissions
       OR OLD.grantable_roles IS DISTINCT FROM NEW.grantable_roles)
    EXECUTE FUNCTION rbac._on_role_definition_change();

CREATE TRIGGER on_member_permission_change
    AFTER INSERT OR DELETE ON rbac.member_permissions
    FOR EACH ROW EXECUTE FUNCTION rbac._sync_member_permission();

-- ─────────────────────────────────────────────────────────────────────────────
-- POSTGREST HOOK
-- ─────────────────────────────────────────────────────────────────────────────

ALTER ROLE authenticator SET pgrst.db_pre_request TO 'rbac.db_pre_request';
NOTIFY pgrst, 'reload config';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PUBLIC API WRAPPERS (OPT-IN)
-- Public wrappers are NOT created automatically. To expose functions in the
-- public schema for PostgREST RPC discovery or unqualified RLS policy calls,
-- run the opt-in script after installation:
--
--   examples/setup/create_public_wrappers.sql
--
-- Without wrappers, use schema-qualified calls everywhere:
--   • RLS policies:  USING (rbac.has_role(group_id, 'owner'))
--   • Client SDK:    supabase.schema('rbac').rpc('create_group', {...})
--   • Auth hook URI: pg-functions://postgres/rbac/custom_access_token_hook
--
-- To remove previously created wrappers, see:
--   examples/setup/remove_public_wrappers.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Version tracking (auto-generated by tools/install.sh)
CREATE OR REPLACE FUNCTION rbac._version()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
    SELECT '5.2.1'::text;
$function$;

REVOKE EXECUTE ON FUNCTION rbac._version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rbac._version() TO authenticated, anon, service_role, authenticator;
"""

ROLE_SQL = r"""
-- ═══════════════════════════════════════════════════════════════════════════
-- LoadTruth roles & permissions (built on supabase-tenant-rbac)
-- ═══════════════════════════════════════════════════════════════════════════
-- Defines the five RBAC roles from PLAN.md §2 on top of the vendored extension.
-- Run as service_role / in a migration (role + permission RPCs are privileged).
--
-- The extension pre-seeds an 'owner' role (full admin, grantable '*'). We keep it
-- as the technical group-creator bootstrap role and map our product roles beneath
-- it. A user can hold several roles; permissions are the union of their roles'.
--
-- Escalation prevention: grantable_roles controls who may grant what. county_admin
-- can invite/assign operational roles but NOT super_admin; super_admin is platform
-- staff (us) and is assigned out-of-band, never granted from inside a tenant.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- Permission registry (dot-notation; checked in RLS via rbac.has_permission)
-- ─────────────────────────────────────────────────────────────────────────
SELECT rbac.create_permission('ticket.read',     'View load tickets and evidence');
SELECT rbac.create_permission('ticket.review',    'Confirm or override ticket fields');
SELECT rbac.create_permission('dispute.resolve',  'Resolve disputed tickets, reassign review');
SELECT rbac.create_permission('event.manage',     'Create/edit disaster events and rate tables');
SELECT rbac.create_permission('truck.manage',     'Manage the certified-truck registry');
SELECT rbac.create_permission('source.manage',    'Connect/edit evidence sources (upload, streams, cameras)');
SELECT rbac.create_permission('members.manage',   'Invite users and assign roles within the tenant');
SELECT rbac.create_permission('report.read',      'View dashboards and reports');
SELECT rbac.create_permission('report.export',    'Export FEMA/FROC audit packets');
SELECT rbac.create_permission('chat.use',         'Use the read-only AI analyst chat');

-- ─────────────────────────────────────────────────────────────────────────
-- Roles (name, description, permissions[], grantable_roles[])
--
-- ORDER MATTERS: create_role runs _validate_grantable_roles, which requires
-- every grantable role to ALREADY EXIST in rbac.roles (except '*'). So define
-- leaf roles (monitor, auditor) before roles that can grant them.
-- ─────────────────────────────────────────────────────────────────────────

-- monitor — reviews clips, confirms/overrides ticket fields (leaf: grants nothing)
SELECT rbac.create_role(
    'monitor',
    'Reviews clips and confirms or overrides ticket fields',
    ARRAY['ticket.read', 'ticket.review', 'report.read'],
    ARRAY[]::text[]
);

-- auditor — read-only across the tenant + export audit packets (leaf: grants nothing)
SELECT rbac.create_role(
    'auditor',
    'Read-only across the tenant; exports audit packets and uses analyst chat',
    ARRAY['ticket.read', 'report.read', 'report.export', 'chat.use'],
    ARRAY[]::text[]
);

-- supervisor — monitor + resolve disputes + reassign + manage sources.
-- Grants monitor (must exist above).
SELECT rbac.create_role(
    'supervisor',
    'Monitor plus dispute resolution, reassignment, and source management',
    ARRAY['ticket.read', 'ticket.review', 'dispute.resolve',
          'source.manage', 'report.read', 'chat.use'],
    ARRAY['monitor']
);

-- county_admin — manage events, trucks, rates, sources, invite users, reports.
-- Grants monitor/supervisor/auditor (all must exist above), NOT super_admin.
SELECT rbac.create_role(
    'county_admin',
    'Manages events, truck registry, rate tables, sources, and users',
    ARRAY['ticket.read', 'ticket.review', 'dispute.resolve',
          'event.manage', 'truck.manage', 'source.manage',
          'members.manage', 'report.read', 'report.export', 'chat.use'],
    ARRAY['monitor', 'supervisor', 'auditor']
);

-- super_admin — cross-tenant platform operators (us). Full permission set.
-- Assigned out-of-band (service_role), never grantable from inside a tenant.
SELECT rbac.create_role(
    'super_admin',
    'Platform operator (LoadTruth staff) — cross-tenant provisioning and ops',
    ARRAY['ticket.read', 'ticket.review', 'dispute.resolve',
          'event.manage', 'truck.manage', 'source.manage', 'members.manage',
          'report.read', 'report.export', 'chat.use'],
    ARRAY[]::text[]
);
"""

POLICY_SQL = r"""
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
"""

RBAC_POLICY_SQL = r"""
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
"""

EXTRA_OPERATIONAL_SQL = (
    r"""
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
)
""",
    r"""
CREATE INDEX idx_clips_tenant       ON public.clips (tenant_id)
""",
    r"""
CREATE INDEX idx_clips_event        ON public.clips (event_id)
""",
    r"""
CREATE INDEX idx_clips_content_hash ON public.clips (content_hash)
""",
    r"""
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
)
""",
    r"""
CREATE INDEX idx_pruns_tenant ON public.pipeline_runs (tenant_id)
""",
    r"""
CREATE INDEX idx_pruns_clip   ON public.pipeline_runs (clip_id)
""",
    r"""
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
)
""",
    r"""
CREATE INDEX idx_tracks_tenant ON public.tracks (tenant_id)
""",
    r"""
CREATE INDEX idx_tracks_clip   ON public.tracks (clip_id)
""",
    r"""
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
)
""",
    r"""
CREATE INDEX idx_benchmarks_tenant ON public.benchmarks (tenant_id)
""",
    r"""
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
)
""",
    r"""
CREATE INDEX idx_reports_tenant ON public.reports (tenant_id)
""",
    r"""
CREATE INDEX idx_reports_event  ON public.reports (event_id)
""",
    r"""
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
)
""",
    r"""
CREATE INDEX idx_audit_tenant ON public.audit_log (tenant_id, created_at DESC)
""",
)


ORM_TABLE_SQL = (
    r"""

CREATE TABLE ai_stage_results (
	content_hash VARCHAR(64) NOT NULL,
	stage_key VARCHAR(32) NOT NULL,
	model VARCHAR(48) NOT NULL,
	result_json JSON NOT NULL,
	confidence NUMERIC(4, 3),
	id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
)


""",
    r"""
CREATE UNIQUE INDEX ix_ai_stage_results_lookup ON ai_stage_results (tenant_id, content_hash, stage_key)
""",
    r"""
CREATE INDEX ix_ai_stage_results_tenant_id ON ai_stage_results (tenant_id)
""",
    r"""

CREATE TABLE anomalies (
	ticket_id UUID NOT NULL,
	type VARCHAR(32) NOT NULL,
	severity VARCHAR(8) NOT NULL,
	explanation VARCHAR(512),
	evidence_frame VARCHAR(128),
	id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
)


""",
    r"""
CREATE INDEX ix_anomalies_tenant_ticket ON anomalies (tenant_id, ticket_id)
""",
    r"""
CREATE INDEX ix_anomalies_tenant_id ON anomalies (tenant_id)
""",
    r"""

CREATE TABLE events (
	name VARCHAR(200) NOT NULL,
	location VARCHAR(200),
	status VARCHAR(16) NOT NULL,
	rate_table JSON NOT NULL,
	id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
)


""",
    r"""
CREATE INDEX ix_events_tenant_id ON events (tenant_id)
""",
    r"""

CREATE TABLE pipeline_stages (
	ticket_id UUID NOT NULL,
	position NUMERIC(4, 0) NOT NULL,
	stage_key VARCHAR(32) NOT NULL,
	label VARCHAR(64) NOT NULL,
	model VARCHAR(48) NOT NULL,
	status VARCHAR(12) NOT NULL,
	summary VARCHAR(512) NOT NULL,
	confidence NUMERIC(4, 3),
	duration_ms NUMERIC(10, 1) NOT NULL,
	details JSON,
	analysis VARCHAR(2048),
	id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
)


""",
    r"""
CREATE INDEX ix_pipeline_stages_tenant_ticket ON pipeline_stages (tenant_id, ticket_id)
""",
    r"""
CREATE INDEX ix_pipeline_stages_tenant_id ON pipeline_stages (tenant_id)
""",
    r"""

CREATE TABLE sources (
	event_id UUID NOT NULL,
	kind VARCHAR(16) NOT NULL,
	name VARCHAR(200) NOT NULL,
	config JSON NOT NULL,
	status VARCHAR(16) NOT NULL,
	id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
)


""",
    r"""
CREATE INDEX ix_sources_event ON sources (event_id)
""",
    r"""
CREATE INDEX ix_sources_tenant ON sources (tenant_id)
""",
    r"""
CREATE INDEX ix_sources_tenant_id ON sources (tenant_id)
""",
    r"""

CREATE TABLE ticket_evidence (
	ticket_id UUID NOT NULL,
	content_hash VARCHAR(64) NOT NULL,
	media_kind VARCHAR(8) NOT NULL,
	mime VARCHAR(48) NOT NULL,
	fps NUMERIC(6, 3),
	segments JSON NOT NULL,
	id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
)


""",
    r"""
CREATE INDEX ix_ticket_evidence_tenant_id ON ticket_evidence (tenant_id)
""",
    r"""
CREATE UNIQUE INDEX ix_ticket_evidence_tenant_ticket ON ticket_evidence (tenant_id, ticket_id)
""",
    r"""

CREATE TABLE tickets (
	event_id UUID NOT NULL,
	clip_id UUID,
	truck_id VARCHAR(64),
	certified_cubic_yards NUMERIC(10, 3) NOT NULL,
	debris_class VARCHAR(32) NOT NULL,
	rate_per_cy NUMERIC(12, 2) NOT NULL,
	est_fill_pct NUMERIC(5, 2) NOT NULL,
	est_cubic_yards NUMERIC(10, 3) NOT NULL,
	est_dollar_value NUMERIC(12, 2) NOT NULL,
	monitor_call_fill_pct NUMERIC(5, 2),
	monitor_cubic_yards NUMERIC(10, 3),
	monitor_dollar_value NUMERIC(12, 2),
	delta_cubic_yards NUMERIC(10, 3),
	delta_dollar_value NUMERIC(12, 2),
	status VARCHAR(16) NOT NULL,
	confirmed_fill_pct NUMERIC(5, 2),
	evidence_frames JSON NOT NULL,
	id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
)


""",
    r"""
CREATE INDEX ix_tickets_tenant_id ON tickets (tenant_id)
""",
    r"""
CREATE INDEX ix_tickets_tenant_event ON tickets (tenant_id, event_id)
""",
    r"""
CREATE INDEX ix_tickets_tenant_status ON tickets (tenant_id, status)
""",
    r"""

CREATE TABLE trucks (
	truck_number VARCHAR(64) NOT NULL,
	body_type VARCHAR(64),
	certified_cubic_yards NUMERIC(10, 3) NOT NULL,
	registry_source VARCHAR(64),
	id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
)


""",
    r"""
CREATE UNIQUE INDEX ix_trucks_tenant_number ON trucks (tenant_id, truck_number)
""",
    r"""
CREATE INDEX ix_trucks_tenant_id ON trucks (tenant_id)
""",
    r"""

CREATE TABLE users (
	email VARCHAR(200) NOT NULL,
	full_name VARCHAR(120),
	role VARCHAR(24) NOT NULL,
	status VARCHAR(16) NOT NULL,
	id UUID NOT NULL,
	tenant_id UUID NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id)
)


""",
    r"""
CREATE UNIQUE INDEX ix_users_tenant_email ON users (tenant_id, email)
""",
    r"""
CREATE INDEX ix_users_tenant_id ON users (tenant_id)
""",
)

_TAG = re.compile(r"\$[A-Za-z_0-9]*\$")


def _statements(sql: str) -> list[str]:
    """Split SQL without splitting quoted values, comments, or dollar-quoted functions."""
    result: list[str] = []
    buf: list[str] = []
    i = 0
    quote = None
    tag = None
    line = False
    depth = 0
    while i < len(sql):
        if line:
            c = sql[i]
            buf.append(c)
            i += 1
            if c == "\n":
                line = False
            continue
        if depth:
            if sql.startswith("/*", i):
                buf.append("/*")
                i += 2
                depth += 1
            elif sql.startswith("*/", i):
                buf.append("*/")
                i += 2
                depth -= 1
            else:
                buf.append(sql[i])
                i += 1
            continue
        if tag:
            if sql.startswith(tag, i):
                buf.append(tag)
                i += len(tag)
                tag = None
            else:
                buf.append(sql[i])
                i += 1
            continue
        if quote:
            c = sql[i]
            buf.append(c)
            i += 1
            if c == quote:
                if i < len(sql) and sql[i] == quote:
                    buf.append(sql[i])
                    i += 1
                else:
                    quote = None
            elif c == "\\" and quote == "'" and i < len(sql):
                buf.append(sql[i])
                i += 1
            continue
        if sql.startswith("--", i):
            buf.append("--")
            i += 2
            line = True
        elif sql.startswith("/*", i):
            buf.append("/*")
            i += 2
            depth = 1
        elif sql[i] in "'\"":
            quote = sql[i]
            buf.append(sql[i])
            i += 1
        elif sql[i] == "$" and (match := _TAG.match(sql, i)):
            tag = match.group()
            buf.append(tag)
            i += len(tag)
        elif sql[i] == ";":
            statement = "".join(buf).strip()
            if statement:
                result.append(statement)
            buf.clear()
            i += 1
        else:
            buf.append(sql[i])
            i += 1
    tail = "".join(buf).strip()
    if tail:
        result.append(tail)
    return result

def _execute_script(sql: str) -> None:
    for statement in _statements(sql):
        op.execute(statement)


def _is_supabase() -> bool:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return False
    return bool(
        bind.execute(
            sa.text(
                "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='auth') "
                "AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator')"
            )
        ).scalar()
    )

def upgrade() -> None:
    from app.db import models  # noqa: F401 — register the ORM tables
    from app.db.base import Base
    if not _is_supabase():
        Base.metadata.create_all(bind=op.get_bind())
        return
    _execute_script(VENDORED_RBAC_SQL)
    _execute_script(ROLE_SQL)
    for statement in ORM_TABLE_SQL:
        op.execute(statement)
    _execute_script("CREATE EXTENSION IF NOT EXISTS vector")
    for statement in EXTRA_OPERATIONAL_SQL:
        op.execute(statement)
    for table in (
        "events",
        "sources",
        "trucks",
        "tickets",
        "anomalies",
        "clips",
        "pipeline_runs",
        "tracks",
        "benchmarks",
        "reports",
        "audit_log",
        "users",
        "pipeline_stages",
        "ai_stage_results",
        "ticket_evidence",
    ):
        op.execute(sa.text(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY"))
    _execute_script(POLICY_SQL)
    _execute_script(RBAC_POLICY_SQL)
    for table in ("pipeline_stages", "ai_stage_results", "ticket_evidence"):
        op.execute(sa.text(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY"))
        op.execute(
            sa.text(
                f'CREATE POLICY "{table} member read" ON public.{table} '
                "FOR SELECT TO authenticated USING (rbac.is_member(tenant_id))"
            )
        )
        op.execute(
            sa.text(
                f'CREATE POLICY "{table} service access" ON public.{table} '
                "FOR ALL TO service_role USING (true) WITH CHECK (true)"
            )
        )

    op.execute(sa.text("ALTER TABLE public.users ENABLE ROW LEVEL SECURITY"))
    op.execute(
        sa.text(
            'CREATE POLICY "users member read" ON public.users '
            "FOR SELECT TO authenticated USING (rbac.is_member(tenant_id))"
        )
    )
    op.execute(
        sa.text(
            'CREATE POLICY "users manage" ON public.users FOR ALL TO authenticated '
            "USING (rbac.has_permission(tenant_id, 'members.manage')) "
            "WITH CHECK (rbac.has_permission(tenant_id, 'members.manage'))"
        )
    )
    op.execute(
        sa.text(
            'CREATE POLICY "users service access" ON public.users '
            "FOR ALL TO service_role USING (true) WITH CHECK (true)"
        )
    )


def downgrade() -> None:
    from app.db import models  # noqa: F401
    from app.db.base import Base
    bind = op.get_bind()
    if _is_supabase():
        for table in ("audit_log", "reports", "benchmarks", "tracks", "pipeline_runs", "clips"):
            op.execute(sa.text(f"DROP TABLE IF EXISTS public.{table} CASCADE"))
        Base.metadata.drop_all(bind=bind)
        op.execute(sa.text("DROP SCHEMA IF EXISTS rbac CASCADE"))
    else:
        Base.metadata.drop_all(bind=bind)
