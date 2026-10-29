# infra/ — Supabase RLS and platform SQL

Supabase-specific database assets for LoadTruth: Row-Level Security policies keyed on `tenant_id` and platform SQL. The application schema and Alembic migrations are owned by `backend/`.

## Planned contents

```
infra/
  rbac/                 # RLS policies, roles, and vendored RBAC SQL
```

## Rules (from the agent protocol)

- Every tenant table has an RLS policy keyed on `tenant_id`; isolation is tested (`backend/tests` RLS tests), not assumed.
- Index every foreign key and every hot-path `WHERE`/`ORDER BY` column in the backend migration that introduces the access pattern.
- `make db-migrate` applies backend Alembic revisions. Apply the SQL in `rbac/` as part of Supabase provisioning to enable RLS.

Alembic starts at `backend/migrations/versions/0001_initial_schema.py`. Revision
0001 freezes the current backend table DDL and includes the Supabase RBAC
installer, LoadTruth roles, operational tables, and RLS policies. The SQL under
`infra/rbac/` remains the readable upstream/provisioning source; future schema
changes should use explicit Alembic operations in backend revisions.
