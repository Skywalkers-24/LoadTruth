"""Database layer: async engine/session and per-request tenant-context binding.

Tenant isolation is enforced in Postgres via the vendored supabase-tenant-rbac
RLS helpers (see infra/rbac/). This package makes those helpers work when the API
talks to Postgres directly: it binds the request's Supabase JWT to the connection
so `auth.uid()` resolves and `rbac.*` policies read the user's claims cache.
"""
