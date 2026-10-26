# infra/rbac — vendored multi-tenant RBAC (third-party)

This directory vendors the **supabase-tenant-rbac** PostgreSQL extension (v5.2.1),
which provides the multi-tenant, role-based access-control primitives LoadTruth's
tenancy model (PLAN.md §2, §7) is built on: per-organization groups, members with
per-group roles, a permissions registry, a claims cache, privilege-escalation
prevention, and RLS helper functions (`rbac.is_member`, `rbac.has_role`,
`rbac.has_permission`, …).

## Attribution & license

- **Upstream:** https://github.com/point-source/supabase-tenant-rbac
- **Version:** 5.2.1
- **License:** BSD-2-Clause — see [`LICENSE.upstream.md`](./LICENSE.upstream.md)
  (Copyright (c) 2023, PointSource). The BSD-2 terms require the copyright notice
  and disclaimer to travel with the source; `LICENSE.upstream.md` satisfies that.

`00_install_rbac_vendored.sql` is the extension's generated install migration,
copied verbatim (do **not** hand-edit it — regenerate from upstream to update,
and log the version bump in CHANGELOG.md). Everything LoadTruth-specific lives in
the sibling numbered files, which build *on top of* the extension — this is the
"build meaningfully on top of open source" the hackathon waiver requires.

## How LoadTruth uses it

The extension's `rbac.groups` **is our tenant** and `rbac.members` **is our
membership** (user ↔ tenant ↔ roles). We do not introduce a parallel `tenants`
table; `rbac.groups.id` is the `tenant_id` every operational row carries.

| PLAN.md concept | Extension object |
|---|---|
| tenant (organization) | `rbac.groups` |
| membership (user ↔ tenant ↔ role) | `rbac.members` |
| role (`monitor` … `super_admin`) | `rbac.roles` + per-member `roles[]` |
| RLS isolation on a tenant table | `rbac.is_member(tenant_id)` / `rbac.has_permission(...)` |

## Apply order

```
00_install_rbac_vendored.sql   # third-party extension (verbatim)
10_loadtruth_roles.sql         # our 5 roles + permission registry (on top)
20_loadtruth_schema.sql        # our operational tables (events, clips, tickets, …)
30_loadtruth_policies.sql      # RLS policies for our tables, using rbac helpers
40_rbac_base_policies.sql      # starter policies for the rbac.* tables themselves
```

## Claims resolution (why the FastAPI binding is thin)

`rbac.get_claims()` resolves a user's group/role/permission claims from, in order:
the `request.groups` GUC, else `auth.jwt()->'groups'`, else the `rbac.user_claims`
cache keyed on `auth.uid()`. Because the cache path keys off `auth.uid()`, our
backend only has to make `auth.uid()` resolve for the connection — it sets
`request.jwt.claims` per request (see `backend/app/db/tenant.py`) and the helpers
read the cache automatically. No group data needs to be packed into our own tokens.
