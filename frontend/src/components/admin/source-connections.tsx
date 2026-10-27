"use client";

import { useState } from "react";

import type { Source, SourceKind } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CameraIcon } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useSourceMutations, useSources } from "@/lib/hooks";
import { relativeTime, sourceKindLabel } from "@/lib/format";

/** A config field for a provider. `secret` fields are masked and write-only. */
interface ConfigField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  optional?: boolean;
}

interface Provider {
  kind: SourceKind;
  label: string;
  blurb: string;
  fields: ConfigField[];
  /** When false, the provider is shown but not selectable ("coming soon").
      The backend adapter + config stay in place, so enabling it is a one-line
      flip here with no other changes. */
  enabled?: boolean;
}

/** Real enterprise evidence providers, each with its own connection settings.
    Cloud-storage connectors (S3/GCS/Azure/Drive/Dropbox) are kept wired but
    disabled for now — the field/push sources (upload, RTSP, HLS, webhook) are
    the ones in use. Flip `enabled` to turn any of them back on. */
const PROVIDERS: Provider[] = [
  { kind: "upload", label: "File upload", blurb: "Operators upload clips directly.", fields: [], enabled: true },
  {
    kind: "s3",
    label: "Amazon S3",
    blurb: "Pull clips from an S3 bucket.",
    fields: [
      { key: "bucket", label: "Bucket", placeholder: "pinellas-debris-clips" },
      { key: "region", label: "Region", placeholder: "us-east-1" },
      { key: "prefix", label: "Prefix", placeholder: "2026/", optional: true },
      { key: "access_key_id", label: "Access key ID", placeholder: "AKIA…", secret: true, optional: true },
      { key: "secret_access_key", label: "Secret access key", placeholder: "••••••", secret: true, optional: true },
    ],
  },
  {
    kind: "gcs",
    label: "Google Cloud Storage",
    blurb: "Pull clips from a GCS bucket.",
    fields: [
      { key: "bucket", label: "Bucket", placeholder: "pinellas-debris-clips" },
      { key: "prefix", label: "Prefix", placeholder: "2026/", optional: true },
      { key: "service_account_json", label: "Service account JSON", placeholder: "paste key JSON", secret: true, optional: true },
    ],
  },
  {
    kind: "azure_blob",
    label: "Azure Blob Storage",
    blurb: "Pull clips from an Azure container.",
    fields: [
      { key: "account", label: "Storage account", placeholder: "pinellasdebris" },
      { key: "container", label: "Container", placeholder: "clips" },
      { key: "sas_token", label: "SAS token", placeholder: "?sv=…", secret: true, optional: true },
    ],
  },
  {
    kind: "google_drive",
    label: "Google Drive",
    blurb: "Sync clips from a shared Drive folder.",
    fields: [
      { key: "folder_id", label: "Folder ID", placeholder: "1AbC…XyZ" },
      { key: "service_account_json", label: "Service account JSON", placeholder: "paste key JSON", secret: true, optional: true },
    ],
  },
  {
    kind: "dropbox",
    label: "Dropbox",
    blurb: "Sync clips from a Dropbox folder.",
    fields: [
      { key: "path", label: "Folder path", placeholder: "/debris-clips/pinellas" },
      { key: "access_token", label: "Access token", placeholder: "••••••", secret: true, optional: true },
    ],
  },
  {
    kind: "rtsp",
    label: "RTSP camera",
    blurb: "Connect a tower camera or NVR stream.",
    fields: [{ key: "url", label: "Stream URL", placeholder: "rtsp://cameras.local/site4/stream" }],
    enabled: true,
  },
  {
    kind: "hls",
    label: "HLS stream",
    blurb: "Connect an HLS playlist stream.",
    fields: [{ key: "url", label: "Playlist URL", placeholder: "https://cameras.local/site4/index.m3u8" }],
    enabled: true,
  },
  {
    kind: "webhook",
    label: "Webhook",
    blurb: "Receive clips pushed from another system.",
    fields: [
      { key: "endpoint", label: "Endpoint URL", placeholder: "https://api.county.gov/hooks/clips" },
      { key: "signing_secret", label: "Signing secret", placeholder: "••••••", secret: true, optional: true },
    ],
    enabled: true,
  },
];

const SOURCE_STATUS_TONE = {
  active: "ok",
  paused: "neutral",
  error: "danger",
} as const;

/** Source connections admin: list, connect (provider-aware), test, and remove. */
export function SourceConnections({ eventId }: { eventId: string }) {
  const sources = useSources(eventId);
  const { create, remove, test } = useSourceMutations(eventId);
  const toast = useToast();
  const [kind, setKind] = useState<SourceKind>("upload");
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, { ok: boolean; detail: string; at: string }>>(
    {},
  );
  const [removing, setRemoving] = useState<Source | null>(null);

  const provider = PROVIDERS.find((p) => p.kind === kind)!;
  const missingRequired = provider.fields.some(
    (f) => !f.optional && !values[f.key]?.trim(),
  );

  function selectKind(next: SourceKind) {
    setKind(next);
    setValues({});
  }

  function connect(e: React.FormEvent) {
    e.preventDefault();
    const config: Record<string, string> = {};
    for (const f of provider.fields) {
      const v = values[f.key]?.trim();
      if (v) config[f.key] = v;
    }
    create.mutate(
      { kind, name: name.trim() || provider.label, config },
      {
        onSuccess: () => {
          toast.push("ok", `Connected ${name.trim() || provider.label}.`);
          setName("");
          setValues({});
        },
        onError: () => toast.push("danger", "Could not connect the source."),
      },
    );
  }

  function runTest(id: string) {
    test.mutate(id, {
      onSuccess: (r) =>
        setResult((prev) => ({
          ...prev,
          [id]: { ok: r.ok, detail: r.detail, at: new Date().toISOString() },
        })),
      onError: () =>
        setResult((prev) => ({
          ...prev,
          [id]: { ok: false, detail: "Connection test failed.", at: new Date().toISOString() },
        })),
    });
  }

  function confirmRemove() {
    if (!removing) return;
    const s = removing;
    remove.mutate(s.id, {
      onSuccess: () => {
        toast.push("ok", `Removed ${s.name}.`);
        setRemoving(null);
      },
      onError: () => {
        toast.push("danger", "Could not remove the source.");
        setRemoving(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Connect a source */}
      <form
        onSubmit={connect}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"
      >
        <div className="mb-3 text-[12px] font-semibold text-[var(--color-text)]">
          Connect a source
        </div>

        {/* Provider picker. Disabled providers are shown (so the capability is
            visible) but not selectable, with a "Soon" badge. */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => {
            const active = p.kind === kind;
            const disabled = p.enabled === false;
            return (
              <button
                key={p.kind}
                type="button"
                disabled={disabled}
                aria-disabled={disabled}
                title={disabled ? "Coming soon — connector is wired but not enabled yet" : undefined}
                onClick={() => !disabled && selectKind(p.kind)}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                  backgroundColor: active ? "var(--color-accent-soft)" : "var(--color-surface)",
                  color: active ? "var(--color-text)" : "var(--color-muted-foreground)",
                }}
              >
                {p.label}
                {disabled && (
                  <span className="rounded-full bg-[var(--color-surface-3)] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-subtle)]">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mb-3 text-[12px] text-[var(--color-subtle)]">{provider.blurb}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12px] text-[var(--color-muted-foreground)]">
            Connection name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${provider.label} connection`}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </label>
          {provider.fields.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-[12px] text-[var(--color-muted-foreground)]">
              {f.label}
              {f.optional && <span className="text-[var(--color-subtle)]"> (optional)</span>}
              <input
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                type={f.secret ? "password" : "text"}
                autoComplete={f.secret ? "new-password" : "off"}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={create.isPending || missingRequired}>
            Connect source
          </Button>
          <span className="text-[12px] text-[var(--color-subtle)]">
            Credentials are stored securely and never shown again.
          </span>
        </div>
      </form>

      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--color-text)]">Connected sources</span>
        <span className="text-[11px] tabular-nums text-[var(--color-subtle)]">
          {sources.data?.length ?? 0} sources
        </span>
      </div>

      {sources.isLoading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (sources.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CameraIcon size={20} />}
          title="No sources connected"
          description="Connect a storage bucket, cloud folder, camera, or webhook to ingest evidence."
        />
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          {sources.data?.map((s: Source) => {
            const r = result[s.id];
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-[var(--color-text)]">
                      {s.name}
                    </span>
                    <Badge tone={SOURCE_STATUS_TONE[s.status]}>{s.status}</Badge>
                  </span>
                  <span className="text-[12px] text-[var(--color-muted-foreground)]">
                    {sourceKindLabel(s.kind)}
                  </span>
                  {r && (
                    <span
                      className="mt-0.5 text-[12px]"
                      style={{ color: r.ok ? "var(--color-ok)" : "var(--color-danger)" }}
                    >
                      {r.ok ? "Connection OK" : "Connection issue"}. {r.detail} {relativeTime(r.at)}
                    </span>
                  )}
                </span>
                <span className="flex gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => runTest(s.id)}
                    disabled={test.isPending}
                  >
                    Test connection
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setRemoving(s)}
                    disabled={remove.isPending}
                  >
                    Remove
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this source?"
        description={removing ? `${removing.name} will be disconnected from this event.` : ""}
        confirmLabel="Remove"
        confirmVariant="danger"
        busy={remove.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
