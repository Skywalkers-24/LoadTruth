---
inclusion: always
---

# UI density scale (LoadTruth)

The console's text sizes and card spacing are centralized so the whole UI can be
retuned from one place. Do not scatter hardcoded `text-[NNpx]` / `p-4` / `py-2.5`
values across components for cards and page titles.

## Single source of truth

`frontend/src/app/globals.css` defines the scale as CSS variables and classes:

- Variables (edit these to resize everything): `--lt-card-pad`,
  `--lt-card-pad-y`, `--lt-card-pad-dense`, `--lt-card-title`, `--lt-page-title`,
  `--lt-ticket-title`.
- Classes that consume them:
  - `.lt-card-head` (card/section header row) and `.lt-card-head--dense`
  - `.lt-card-body` and `.lt-card-body--dense`
  - `.lt-card-title` (card/section title text)
  - `.lt-page-title` (every screen's H1)

## Rules

- A console card header is `<header class="lt-card-head ...">` with an
  `<h3 class="lt-card-title">`; its body is `<div class="lt-card-body">`. Use the
  `--dense` variants for compact cards (e.g. the Decision card).
- Every page title is `<h1 class="lt-page-title">`. The shared `PageHeader`
  component already applies it.
- To make the UI denser or roomier, change the variables in globals.css. That is
  the quick knob; one edit moves all cards and headers together.
- Body copy still obeys the UI copy rule: minimum 12px for meaningful text, 11px
  only for terse metadata labels.
