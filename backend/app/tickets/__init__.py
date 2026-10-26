"""Ticket domain: the load ticket, its money math, and schemas.

The dollar-delta (monitor's call vs. LoadTruth's measurement) is the demo's
"money frame" — see PLAN.md §7a. All volume/dollar math lives in `money.py` as
pure, deterministic functions (never the model), so it is provably correct and
unit-testable without a database or API credits.
"""
