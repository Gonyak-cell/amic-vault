from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.security.clamav_client import ScanOutcome, ScanVerdict
from app.security_router import ClamAvClient
from app.service_identity import INGESTION_GATEWAY_WORKLOAD_SUBJECT, INGESTION_WORKER_AUDIENCE

TENANT_ID = "11111111-1111-4111-8111-111111111111"
GATEWAY_ENV = {
    "NODE_ENV": "production",
    "INGESTION_WORKER_IDENTITY_PROFILE": "private-gateway-mtls",
    "INGESTION_GATEWAY_MTLS_ENABLED": "true",
    "INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS": "true",
    "INGESTION_GATEWAY_DIRECT_WORKER_ACCESS": "blocked",
    "INGESTION_GATEWAY_WORKLOAD_SUBJECT": INGESTION_GATEWAY_WORKLOAD_SUBJECT,
    "INGESTION_GATEWAY_AUDIENCE": INGESTION_WORKER_AUDIENCE,
}

client = TestClient(app)


def _binding_headers() -> dict[str, str]:
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=3)).replace(microsecond=0)
    return {
        "x-amic-request-id": str(uuid4()),
        "x-amic-ingestion-nonce": str(uuid4()),
        "x-amic-ingestion-expires-at": expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def _loopback_headers() -> dict[str, str]:
    return {**_binding_headers(), "x-amic-dev-loopback-identity": "true"}


def _gateway_headers() -> dict[str, str]:
    return {
        **_binding_headers(),
        "x-amic-gateway-mtls-verified": "true",
        "x-amic-gateway-workload-subject": INGESTION_GATEWAY_WORKLOAD_SUBJECT,
        "x-amic-gateway-audience": INGESTION_WORKER_AUDIENCE,
    }


def _route_requests(headers: dict[str, str] | None = None) -> list:
    request_headers = headers or {}
    return [
        client.post("/extract", json={}, headers=request_headers),
        client.post("/extract-revisions", json={}, headers=request_headers),
        client.post("/extract-annotations", json={}, headers=request_headers),
        client.post("/extract-clause-tree", json={}, headers=request_headers),
        client.post("/ocr", json={}, headers=request_headers),
        client.post(
            "/convert/docx-to-pdf",
            data={"tenant_id": TENANT_ID},
            files={"file": ("source.docx", b"payload", "application/octet-stream")},
            headers=request_headers,
        ),
        client.post(
            "/convert/office-to-pdf",
            data={"tenant_id": TENANT_ID},
            files={"file": ("source.docx", b"payload", "application/octet-stream")},
            headers=request_headers,
        ),
        client.post(
            "/email/parse",
            data={"tenant_id": TENANT_ID},
            files={"file": ("message.eml", b"payload", "message/rfc822")},
            headers=request_headers,
        ),
        client.post(
            "/security/scan",
            data={"quarantine_ref": TENANT_ID, "expected_sha256": "a" * 64},
            files={"file": ("payload.bin", b"payload", "application/octet-stream")},
            headers=request_headers,
        ),
        client.post(
            "/zip/inspect",
            data={"tenant_id": TENANT_ID, "batch_id": TENANT_ID},
            files={"file": ("batch.zip", b"payload", "application/zip")},
            headers=request_headers,
        ),
    ]


def test_every_worker_operation_denies_direct_requests() -> None:
    responses = _route_requests()

    assert len(responses) == 10
    assert all(response.status_code == 403 for response in responses)
    assert all(response.json() == {"detail": {"code": "PERMISSION_DENIED"}} for response in responses)


def test_private_gateway_profile_denies_loopback_identity_on_every_worker_operation(monkeypatch, tmp_path) -> None:
    for name, value in {**GATEWAY_ENV, "INGESTION_NONCE_STORE_PATH": str(tmp_path / "nonces.sqlite3")}.items():
        monkeypatch.setenv(name, value)

    responses = _route_requests(_loopback_headers())

    assert len(responses) == 10
    assert all(response.status_code == 403 for response in responses)
    assert all(response.json() == {"detail": {"code": "PERMISSION_DENIED"}} for response in responses)


def test_private_gateway_identity_is_accepted_and_health_stays_public(monkeypatch, tmp_path) -> None:
    for name, value in {**GATEWAY_ENV, "INGESTION_NONCE_STORE_PATH": str(tmp_path / "nonces.sqlite3")}.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(
        ClamAvClient,
        "scan",
        lambda _self, _payload: ScanVerdict(ScanOutcome.CLEAN, "1.4.3", 1),
    )

    health = client.get("/health")
    scan = client.post(
        "/security/scan",
        data={"quarantine_ref": TENANT_ID, "expected_sha256": "a" * 64},
        files={"file": ("payload.bin", b"payload", "application/octet-stream")},
        headers={**_gateway_headers(), "x-amic-tenant-id": TENANT_ID},
    )

    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    assert scan.status_code == 200, scan.text


def test_production_loopback_profile_denies_operations_but_not_health(monkeypatch) -> None:
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("INGESTION_WORKER_IDENTITY_PROFILE", "loopback-dev")

    operation = client.post("/email/parse", json={}, headers=_loopback_headers())
    health = client.get("/health")

    assert operation.status_code == 403
    assert operation.json() == {"detail": {"code": "PERMISSION_DENIED"}}
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
