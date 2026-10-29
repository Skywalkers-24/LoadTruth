import type { Ticket } from "@/lib/api";
import type { Severity } from "@/components/ui/badge";

/**
 * The backend computes anomaly detail (app/pipeline/anomalies.py) but the ticket
 * API currently exposes only `anomaly_count` — not the itemized list. To stay
 * honest, we derive the flags we CAN observe from real ticket fields, and if the
 * backend's count exceeds what we can name, we surface the remainder as an
 * explicit "not itemized by the API" row rather than inventing specifics.
 */
export interface DerivedAnomaly {
  key: string;
  title: string;
  severity: Severity;
  explanation: string;
  /** false when this row is inferred rather than returned itemized by the API. */
  itemized: boolean;
}

export function deriveAnomalies(ticket: Ticket): DerivedAnomaly[] {
  const out: DerivedAnomaly[] = [];
  const v = ticket.valuation;

  // Observable: truck could not be identified from the placard.
  if (!ticket.truck_id) {
    out.push({
      key: "identity_unreadable",
      title: "Unreadable placard",
      severity: "warn",
      explanation:
        "The truck placard could not be read from the evidence. Identify the truck manually before certifying this ticket.",
      itemized: true,
    });
  }

  // Observable: monitor over-call (potential overbilling) vs measurement.
  if (v.is_overbill && v.delta_dollar_value) {
    out.push({
      key: "overbill_discrepancy",
      title: "Monitor over-call",
      severity: "high",
      explanation:
        "The monitor's billed value exceeds LoadTruth's measured value. Review the money frame and evidence before confirming.",
      itemized: true,
    });
  }

  // Observable: measured volume exceeds certified capacity.
  const cap = Number.parseFloat(v.certified_cubic_yards);
  const est = Number.parseFloat(v.est_cubic_yards);
  if (!Number.isNaN(cap) && !Number.isNaN(est) && est > cap * 1.02) {
    out.push({
      key: "capacity_exceeded",
      title: "Capacity exceeded",
      severity: "high",
      explanation: `Measured volume (${est.toFixed(1)} CY) exceeds the truck's certified capacity (${cap.toFixed(1)} CY).`,
      itemized: true,
    });
  }

  // Reconcile with the backend count: surface any unexplained remainder honestly.
  const remainder = ticket.anomaly_count - out.length;
  if (remainder > 0) {
    out.push({
      key: "additional_backend_flags",
      title: `${remainder} additional flag${remainder > 1 ? "s" : ""}`,
      severity: "info",
      explanation:
        "Additional compliance checks flagged this load. The audit packet has the full breakdown.",
      itemized: false,
    });
  }

  return out;
}
