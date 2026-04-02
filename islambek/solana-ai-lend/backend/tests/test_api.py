"""Backend API tests — all REST endpoints + WebSocket.

Note: aiohttp may print 'Unclosed client session' to stderr when tests end.
This is cosmetic — in production, lifespan shutdown calls reader.close().
TestClient doesn't fully run async lifespan teardown, so the session leaks
only in the test runner process (no real resource leak).
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# ==========================================
# Health
# ==========================================

def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.1.0"
    assert "ws_clients" in body
    assert "solana_rpc" in body


# ==========================================
# Pool (503 expected — no pool deployed)
# ==========================================

def test_pool_state_no_pool(client):
    r = client.get("/api/pool/state")
    assert r.status_code == 503


def test_pool_stats_no_pool(client):
    r = client.get("/api/pool/stats")
    assert r.status_code == 503


# ==========================================
# Decisions — empty DB
# ==========================================

def test_decisions_list_empty(client):
    r = client.get("/api/decisions/")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0
    assert body["page"] == 1
    assert isinstance(body["items"], list)
    assert len(body["items"]) == 0


def test_decisions_pagination(client):
    r = client.get("/api/decisions/?page=2&limit=5")
    assert r.status_code == 200
    body = r.json()
    assert body["page"] == 2
    assert body["limit"] == 5


def test_decisions_filter_risk_level(client):
    r = client.get("/api/decisions/?risk_level=high")
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_decisions_invalid_risk_level(client):
    r = client.get("/api/decisions/?risk_level=invalid")
    assert r.status_code == 422


def test_decisions_by_id_not_found(client):
    r = client.get("/api/decisions/1")
    assert r.status_code == 404
    assert r.json()["detail"] == "Decision not found"


def test_decisions_by_id_large_not_found(client):
    r = client.get("/api/decisions/999999")
    assert r.status_code == 404


# ==========================================
# Analytics — empty DB
# ==========================================

def test_rate_history_empty(client):
    r = client.get("/api/analytics/rate-history")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) == 0


def test_rate_history_with_limit(client):
    r = client.get("/api/analytics/rate-history?limit=5")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_risk_history_empty(client):
    r = client.get("/api/analytics/risk-history")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) == 0


def test_risk_history_with_limit(client):
    r = client.get("/api/analytics/risk-history?limit=5")
    assert r.status_code == 200


# ==========================================
# WebSocket
# ==========================================

def test_websocket_connect(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_text("ping")


# ==========================================
# 404 unknown routes
# ==========================================

def test_unknown_route(client):
    r = client.get("/api/nonexistent")
    assert r.status_code == 404
