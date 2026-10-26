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
