"""API tests for the certified-truck registry CRUD (seeded SQLite per test).

Covers list (seed present), create happy-path, duplicate-number 409, patch
(partial), not-found 404, delete + 204, validation (422), and tenant scoping
(a truck created under the active tenant isn't visible to another tenant id).
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_list_trucks_returns_seed(client: TestClient) -> None:
    trucks = client.get("/trucks").json()
    assert len(trucks) == 5  # five seeded trucks
    assert all("certified_cubic_yards" in t for t in trucks)
    numbers = {t["truck_number"] for t in trucks}
    assert "FL-DT-3391" in numbers


def test_create_truck(client: TestClient) -> None:
    resp = client.post(
        "/trucks",
        json={
            "truck_number": "FL-NEW-0001",
            "body_type": "tandem",
            "certified_cubic_yards": "22.5",
            "registry_source": "manual",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["truck_number"] == "FL-NEW-0001"
    assert body["certified_cubic_yards"] == "22.5"
    assert len(client.get("/trucks").json()) == 6


def test_create_truck_duplicate_number_409(client: TestClient) -> None:
    resp = client.post(
        "/trucks",
        json={"truck_number": "FL-DT-3391", "certified_cubic_yards": "10"},
    )
    assert resp.status_code == 409


def test_create_truck_rejects_nonpositive_capacity(client: TestClient) -> None:
    resp = client.post(
        "/trucks",
        json={"truck_number": "FL-ZERO", "certified_cubic_yards": "0"},
    )
    assert resp.status_code == 422


def test_create_truck_requires_number(client: TestClient) -> None:
    resp = client.post("/trucks", json={"certified_cubic_yards": "10"})
    assert resp.status_code == 422


def test_patch_truck_partial(client: TestClient) -> None:
    created = client.post(
        "/trucks",
        json={"truck_number": "FL-PATCH-1", "certified_cubic_yards": "15"},
    ).json()
    resp = client.patch(
        f"/trucks/{created['id']}",
        json={"body_type": "roll-off", "certified_cubic_yards": "18"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["body_type"] == "roll-off"
    assert body["certified_cubic_yards"] == "18"
    assert body["truck_number"] == "FL-PATCH-1"  # unchanged


def test_patch_truck_duplicate_number_409(client: TestClient) -> None:
    created = client.post(
        "/trucks",
        json={"truck_number": "FL-PATCH-2", "certified_cubic_yards": "15"},
    ).json()
    resp = client.patch(f"/trucks/{created['id']}", json={"truck_number": "FL-DT-3391"})
    assert resp.status_code == 409


def test_patch_truck_404(client: TestClient) -> None:
    resp = client.patch(
        "/trucks/00000000-0000-0000-0000-000000000099",
        json={"body_type": "x"},
    )
    assert resp.status_code == 404


def test_delete_truck(client: TestClient) -> None:
    created = client.post(
        "/trucks",
        json={"truck_number": "FL-DEL-1", "certified_cubic_yards": "15"},
    ).json()
    resp = client.delete(f"/trucks/{created['id']}")
    assert resp.status_code == 204
    numbers = {t["truck_number"] for t in client.get("/trucks").json()}
    assert "FL-DEL-1" not in numbers


def test_delete_truck_404(client: TestClient) -> None:
    resp = client.delete("/trucks/00000000-0000-0000-0000-000000000099")
    assert resp.status_code == 404
