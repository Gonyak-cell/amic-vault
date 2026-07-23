from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.security.clamav_client import ScanOutcome, ScanVerdict
from app.security_router import ClamAvClient


def _loopback_identity_headers() -> dict[str, str]:
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=3)).replace(microsecond=0)
    return {
        "x-amic-dev-loopback-identity": "true",
        "x-amic-request-id": str(uuid4()),
        "x-amic-ingestion-nonce": str(uuid4()),
        "x-amic-ingestion-expires-at": expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def test_scan_accepts_only_uploaded_bytes_and_returns_bounded_verdict(monkeypatch) -> None:
    monkeypatch.setattr(ClamAvClient, "scan", lambda _self, _payload: ScanVerdict(ScanOutcome.CLEAN, "1.4.3", 1))
    response = TestClient(app).post(
        "/security/scan",
        data={"quarantine_ref": "11111111-1111-4111-8111-111111111111", "expected_sha256": "a" * 64},
        files={"file": ("ignored.bin", b"safe", "application/octet-stream")},
        headers={
            **_loopback_identity_headers(),
            "x-amic-tenant-id": "22222222-2222-4222-8222-222222222222",
        },
    )
    assert response.status_code == 200
    assert response.json() == {"outcome": "clean", "engine_version": "1.4.3", "signature_age_seconds": 1}


def test_scan_rejects_missing_tenant_or_opaque_inputs() -> None:
    response = TestClient(app).post(
        "/security/scan",
        data={"quarantine_ref": "not-a-ref", "expected_sha256": "not-a-hash"},
        files={"file": ("ignored.bin", b"safe", "application/octet-stream")},
    )
    assert response.status_code == 403


def test_scan_rejects_malformed_identifiers_hash_and_oversized_upload() -> None:
    client = TestClient(app)
    invalid = client.post(
        "/security/scan",
        data={"quarantine_ref": "x" * 36, "expected_sha256": "A" * 64},
        files={"file": ("ignored.bin", b"safe", "application/octet-stream")},
        headers={**_loopback_identity_headers(), "x-amic-tenant-id": "not-a-tenant"},
    )
    oversized = client.post(
        "/security/scan",
        data={"quarantine_ref": "11111111-1111-4111-8111-111111111111", "expected_sha256": "a" * 64},
        files={"file": ("ignored.bin", b"x" * (25 * 1024 * 1024 + 1), "application/octet-stream")},
        headers={
            **_loopback_identity_headers(),
            "x-amic-tenant-id": "22222222-2222-4222-8222-222222222222",
        },
    )

    assert invalid.status_code == 403
    assert oversized.status_code == 413
