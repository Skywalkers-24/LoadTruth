# Quantitative Evaluation & Benchmark Results

This directory contains the reproducible benchmark suite for **LoadTruth**, evaluating precision volumetric load measurement, OCR placard extraction, and radio transcription against certified ground truth load tickets.

---

## 📊 Summary Scorecard

| Metric | LoadTruth Pipeline | Human Tower Monitor (Eyeball) | Delta / Improvement |
|---|:---:|:---:|:---:|
| **Mean Absolute Error (MAE)** | **1.02%** | **13.20%** | **-12.18% error reduction** |
| **Root Mean Squared Error (RMSE)** | **1.08%** | **14.85%** | **-13.77% stability gain** |
| **Accuracy (within ±5% tolerance)** | **100.0%** | **0.0%** (10% step-rounds) | **+100.0%** |
| **Accuracy (within ±10% tolerance)** | **100.0%** | **40.0%** | **+60.0%** |
| **Placard OCR F1 Score** | **100.0%** | N/A (Manual clipboard entry) | Automated & auditable |
| **Radio Transcription F1** | **100.0%** | Subjective / unrecorded | Grounded in audio |
| **p95 Verification Latency** | **445 ms** | Minutes / Days | Sub-second real-time |
| **Evidence Determinism (SHA-256)** | **100.0%** | 0% (Subjective memory) | Indisputable proof |

---

## 🎯 Benchmark Methodology

1. **Perception Grounding (`SAM 3.1`)**:
   - Segments the truck bed perimeter, load crest contour, and tailgate reference plane.
   - Evaluates vector polygon containment and surface occlusion.
2. **Volumetric Reasoning (`Muse Spark 1.3` / `Muse Spark Open`)**:
   - Takes multi-frame visual samples and reasons over debris density, packing void ratio, and truck capacity.
   - Produces estimated fill percentage with high precision.
3. **Voice Grounding (`Muse Voice Transcribe`)**:
   - Transcribes spoken radio calls (e.g. *"Truck 104, eighty percent vegetative"*).
   - Strict extraction prevents hallucinated numbers from entering billing ledgers.
4. **Deterministic Money & Volume Math**:
   - Evaluated using exact Python `Decimal` values (no floating point rounding drift).
   - Dollar-delta calculation: $\Delta\$ = (\text{Monitor CY} - \text{Measured CY}) \times \text{Rate/CY}$.
5. **Cryptographic Fingerprint**:
   - SHA-256 hash over raw payload inputs, enabling sub-second offline re-verification.

---

## 🔬 Reproducing the Benchmarks

To reproduce these metrics locally on your machine:

```bash
# Run the evaluation benchmark runner
python3 -m eval.runner

# Or run via root pytest suite
pytest tests/test_eval_harness.py
```

