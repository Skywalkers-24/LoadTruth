# infra/ — Supabase schema, migrations & RLS

Database layer for LoadTruth: the multi-tenant schema (PLAN.md §7), Row-Level Security policies keyed on `tenant_id`, Storage buckets, and Alembic migrations.

## Planned contents

```
infra/
  migrations/          # Alembic migrations (schema + indexes)
  policies/            # RLS policy SQL per tenant table
  seed/                # demo tenant, event, truck registry, rate table, sample clips
  storage.sql          # bucket definitions (clips, frames, masks, tickets, reports)
```

## Rules (from the agent protocol)

- Every tenant table has an RLS policy keyed on `tenant_id`; isolation is tested (`backend/tests` RLS tests), not assumed.
- Index every foreign key and every hot-path `WHERE`/`ORDER BY` column in the same migration that introduces the access pattern.
- `./scripts/db-migrate.sh` applies migrations and verifies RLS coverage.

Status: not yet implemented — next after the API round-trips land (PROGRESS.md).
