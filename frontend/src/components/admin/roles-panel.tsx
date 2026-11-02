"use client";

import { useState } from "react";

import { ApiError, type Role, type User } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UsersIcon } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { useUserMutations, useUsers } from "@/lib/hooks";
import { relativeTime } from "@/lib/format";

const ROLES: { role: Role; label: string }[] = [
  { role: "monitor", label: "Monitor" },
  { role: "supervisor", label: "Supervisor" },
  { role: "county_admin", label: "County admin" },
  { role: "auditor", label: "Auditor" },
  { role: "super_admin", label: "Super admin" },
];

const ROLE_LABEL: Record<Role, string> = {
  monitor: "Monitor",
  supervisor: "Supervisor",
  county_admin: "County admin",
  auditor: "Auditor",
  super_admin: "Super admin",
};

/**
 * Users & roles admin — real CRUD against the tenant member API (/users).
 * Roles use the product vocabulary; authorization is enforced server-side, the
 * UI reflects it as a usability layer.
 */
export function RolesPanel() {
  const users = useUsers();
  const { create, update, remove } = useUserMutations();
  const { can, member } = useAuth();
  const canManage = member?.role === "super_admin" || Boolean(can("manage_settings"));
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("monitor");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(
      { email: email.trim(), full_name: name.trim() || null, role },
      {
        onSuccess: () => {
          toast.push("ok", `Added ${email.trim()} as ${ROLE_LABEL[role]}.`);
          setEmail("");
          setName("");
          setRole("monitor");
        },
        onError: (err) =>
          setError(
            err instanceof ApiError && err.status === 409
              ? "A user with that email already exists."
              : "Could not add user. Check the fields and try again.",
          ),
      },
    );
  }

  function changeRole(u: User, nextRole: Role) {
    update.mutate(
      { id: u.id, body: { role: nextRole } },
      { onSuccess: () => toast.push("ok", `${u.email} is now ${ROLE_LABEL[nextRole]}.`) },
    );
  }

  function confirmRemove() {
    if (!removing) return;
    const u = removing;
    remove.mutate(u.id, {
      onSuccess: () => {
        toast.push("ok", `Removed ${u.email}.`);
        setRemoving(null);
      },
      onError: () => {
        toast.push("danger", "Couldn’t remove the user.");
        setRemoving(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add user (SuperAdmin only) */}
      {canManage && (
        <form
          onSubmit={add}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[var(--color-subtle)]">
              <UsersIcon size={15} />
            </span>
            <span className="text-[12px] font-semibold text-[var(--color-text)]">Add a user</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_180px_auto] sm:items-end">
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="name@county.gov"
              type="email"
            />
            <Field label="Full name" value={name} onChange={setName} placeholder="Jane Doe" />
            <label className="flex flex-col gap-1 text-[12px] text-[var(--color-muted-foreground)]">
              Role
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="primary" disabled={create.isPending || !emailValid}>
              Add user
            </Button>
          </div>
          {error && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{error}</p>}
        </form>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--color-text)]">Members</span>
        <span className="text-[11px] tabular-nums text-[var(--color-subtle)]">
          {users.data?.length ?? 0} users
        </span>
      </div>

      {users.isLoading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : users.isError ? (
        <EmptyState
          title="Users unavailable"
          description="The backend didn’t return the member list."
        />
      ) : (users.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<UsersIcon size={20} />}
          title="No users yet"
          description="Add the first member above."
        />
      ) : (
        <ul className="lt-scroll max-h-[420px] divide-y divide-[var(--color-border)] overflow-y-auto rounded-lg border border-[var(--color-border)]">
          {users.data?.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={{
                    backgroundColor: "var(--color-accent-fill)",
                    color: "var(--color-on-accent)",
                  }}
                  aria-hidden
                >
                  {initials(u.full_name ?? u.email)}
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium text-[var(--color-text)]">
                    {u.full_name ?? u.email}
                  </span>
                  <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                    {u.email} · added {relativeTime(u.created_at)}
                  </span>
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={u.status === "active" ? "ok" : "neutral"}>{u.status}</Badge>
                {canManage ? (
                  <>
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value as Role)}
                      disabled={update.isPending}
                      aria-label={`Role for ${u.email}`}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[12px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
                    >
                      {ROLES.map((r) => (
                        <option key={r.role} value={r.role}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setRemoving(u)}
                      disabled={remove.isPending}
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <Badge tone="neutral">{ROLE_LABEL[u.role] ?? u.role}</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-[var(--color-subtle)]">
        Roles follow the product vocabulary (monitor, supervisor, county_admin, auditor,
        super_admin). Authorization is enforced by the backend.
      </p>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this user?"
        description={removing ? `${removing.email} will lose access to this tenant.` : ""}
        confirmLabel="Remove"
        confirmVariant="danger"
        busy={remove.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-[var(--color-muted-foreground)]">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </label>
  );
}

function initials(s: string): string {
  const parts = s.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}
