"""Server-side paging + sorting for the ticket ledger and the AI pipeline jobs.

These lock in the fix that moved paging/sorting off the client: `/tickets` now
honors `sort`/`order` (with null sort values forced to the end) and `/system/jobs`
returns a `{items,total,limit,offset}` envelope that can be walked by `offset`.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient

from app.tickets.seed import DEMO_EVENT_ID


def _page(client: TestClient, **params: Any) -> dict[str, Any]:
    params.setdefault("event_id", str(DEMO_EVENT_ID))
    return dict(client.get("/tickets", params=params).json())


def test_tickets_sort_value_desc_vs_asc(client: TestClient) -> None:
    desc = _page(client, sort="value", order="desc", limit=5)
    asc = _page(client, sort="value", order="asc", limit=5)
    desc_vals = [Decimal(t["valuation"]["est_dollar_value"]) for t in desc["items"]]
    asc_vals = [Decimal(t["valuation"]["est_dollar_value"]) for t in asc["items"]]
    assert desc_vals == sorted(desc_vals, reverse=True)
    assert asc_vals == sorted(asc_vals)
    # Highest value overall is the first desc row.
    assert desc_vals[0] >= asc_vals[-1]


def test_tickets_delta_sort_pushes_uncalled_to_end(client: TestClient) -> None:
    # Ascending by delta: rows with a delta come first (ordered), uncalled
    # tickets (null delta) sink to the very end regardless of direction.
    total = _page(client, limit=1)["total"]
    rows = _page(client, sort="delta", order="asc", limit=total)["items"]
    deltas = [t["valuation"]["delta_dollar_value"] for t in rows]
    non_null = [d for d in deltas if d is not None]
    # The non-null deltas are the leading prefix and are sorted ascending.
    assert deltas[: len(non_null)] == non_null
    assert non_null == sorted(non_null, key=Decimal)
    # Every trailing row is a null-delta (uncalled) ticket.
    assert all(d is None for d in deltas[len(non_null) :])


def test_tickets_offset_pages_do_not_overlap(client: TestClient) -> None:
    first = _page(client, sort="value", order="desc", limit=10, offset=0)
    second = _page(client, sort="value", order="desc", limit=10, offset=10)
    ids_first = {t["id"] for t in first["items"]}
    ids_second = {t["id"] for t in second["items"]}
    assert ids_first.isdisjoint(ids_second)
    assert first["total"] == second["total"]
    assert second["offset"] == 10


def test_jobs_envelope_shape_and_paging(client: TestClient) -> None:
    body = client.get("/system/jobs", params={"limit": 5, "offset": 0}).json()
    assert set(body) == {"items", "total", "limit", "offset"}
    assert body["limit"] == 5
    assert body["offset"] == 0
    assert isinstance(body["items"], list)
    assert len(body["items"]) <= 5
    # Paging stays within the total; a far offset returns an empty page, not an error.
    far = client.get("/system/jobs", params={"limit": 5, "offset": 10_000}).json()
    assert far["items"] == []
    assert far["total"] == body["total"]


def test_jobs_scoped_to_owned_event(client: TestClient) -> None:
    # An event id the tenant does not own yields an empty, well-formed envelope.
    body = client.get(
        "/system/jobs",
        params={"event_id": "00000000-0000-0000-0000-0000000000ff", "limit": 5},
    ).json()
    assert body["items"] == []
    assert body["total"] == 0
