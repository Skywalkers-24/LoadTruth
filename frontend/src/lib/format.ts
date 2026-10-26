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
