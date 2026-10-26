/** Display helpers for the operator console. Values arrive as decimal strings. */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/** Format a decimal-string dollar amount, e.g. "43.20" -> "$43.20". */
export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(n)) return "—";
  return USD.format(n);
}

/** Format a decimal-string percentage, e.g. "62.00" -> "62%". */
export function percent(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(n)) return "—";
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`;
}

/** Format cubic yards, e.g. "12.400" -> "12.4 CY". */
export function cubicYards(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(n)) return "—";
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)} CY`;
}

const DEBRIS_LABELS: Record<string, string> = {
  vegetative: "Vegetative",
  construction_demolition: "C&D",
  white_goods: "White goods",
  hazardous: "Hazardous",
  other: "Other",
};

export function debrisLabel(value: string): string {
  return DEBRIS_LABELS[value] ?? value;
}

/**
 * Format a signed dollar delta with an explicit leading sign, e.g.
 * "86.40" -> "+$86.40", "-12.00" -> "−$12.00". Uses a true minus glyph.
 */
export function signedMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${USD.format(Math.abs(n))}`;
}

/** Signed cubic-yard delta, e.g. "3.60" -> "+3.6 CY". */
export function signedCubicYards(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return `${sign}${abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)} CY`;
}

/** Signed percentage-point delta, e.g. 18 -> "+18 pp". */
export function signedPoints(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const abs = Math.abs(value);
  return `${sign}${abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(1)} pp`;
}

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Absolute local timestamp, e.g. "Oct 27, 2:04 PM". */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return DATE_TIME.format(d);
}

/** Compact relative time, e.g. "4m ago", "2h ago", "Oct 27". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return DATE_TIME.format(d);
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Needs review",
  confirmed: "Confirmed",
  overridden: "Overridden",
  disputed: "Disputed",
};

export function statusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value;
}

const SOURCE_KIND_LABELS: Record<string, string> = {
  upload: "File upload",
  s3: "Amazon S3",
  gcs: "Google Cloud Storage",
  azure_blob: "Azure Blob Storage",
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  rtsp: "RTSP camera",
  hls: "HLS stream",
  webhook: "Webhook",
};

export function sourceKindLabel(value: string): string {
  return SOURCE_KIND_LABELS[value] ?? value;
}
