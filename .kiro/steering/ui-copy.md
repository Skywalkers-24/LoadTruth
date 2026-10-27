---
inclusion: always
---

# UI copy standards (LoadTruth)

Write all user-facing copy like a polished enterprise SaaS product. The UI is for
operators, auditors, and county staff, not engineers.

## Hard rules

- NEVER use em dashes (—) or en dashes (–) in any user-facing text. They read as
  AI-generated. Use a comma, a period, parentheses, or split into two sentences.
  A hyphen inside a compound word or an identifier (for example "roll-off",
  "FL-DT-3391", "±10 pp") is fine.
- Do NOT expose internal or build-state language in the UI. Never write things
  like "not wired in this build", "no backend endpoint", "mock", "schematic",
  "demo data", "TODO", "placeholder", or references to how the system is
  implemented. State what the feature does, or show a clean empty/disabled
  state, without narrating the implementation.
- Do not describe data as fake, sample, or illustrative in the product chrome.
  If something is an example, label it plainly (for example "Example") without
  apologizing for it.

## Style

- Concise, confident, plain. Prefer verbs ("Add user", "Connect source",
  "Export CSV"). Sentence case for labels and buttons.
- Keep technical terms (cubic yards, fill %, delta, segmentation) but explain
  non-obvious ones with a hover tooltip rather than inline parentheticals.
- Minimum readable size for meaningful text is 12px; use 11px only for terse
  metadata labels, never for sentences. Never put body copy below 12px.

## Tooltips

- Use the shared Tooltip component for term definitions and metric meanings, not
  the native `title` attribute, so the hover is consistent and legible.
