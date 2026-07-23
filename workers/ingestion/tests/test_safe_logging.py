from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import StringIO
import json
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import enforce_ingestion_service_identity
from app.safe_logging import REDACTED, emit_ingestion_event, safe_reference, sanitize_log_value


GOLDEN_REQUEST_ID = "11111111-1111-4111-8111-111111111111"
GOLDEN_REQUEST_REF = "ref:bd7662a5eeb41614"


def test_safe_reference_matches_the_cross_language_golden_vector() -> None:
    assert safe_reference(GOLDEN_REQUEST_ID) == GOLDEN_REQUEST_REF
    assert safe_reference("11111111-1111-4111-8111-111111111112") != GOLDEN_REQUEST_REF


def test_recursive_sanitizer_removes_raw_data_canaries_and_keeps_bounded_fields() -> None:
    sanitized = sanitize_log_value(
        {
            "documentId": GOLDEN_REQUEST_ID,
            "eventId": 42,
            "nested": [
                {
                    "clientIp": "192.0.2.10",
                    "originalFilename": "client-contract.docx",
                    "arbitraryNote": "confidential contract body",
                    "authorization": "Bearer synthetic-token",
                    "stack": "Error: canary\n at /private/source.py:1",
                    "trace": "trace canary",
                }
            ],
            "status": "ready",
            "method": "POST",
            "context": "IngestionWorker",
        }
    )
    serialized = json.dumps(sanitized, sort_keys=True)

    assert sanitized == {
        "documentId": GOLDEN_REQUEST_REF,
        "eventId": safe_reference("42"),
        "nested": [
            {
                "clientIp": REDACTED,
                "originalFilename": REDACTED,
                "arbitraryNote": REDACTED,
                "authorization": REDACTED,
                "stack": REDACTED,
                "trace": REDACTED,
            }
        ],
        "status": "ready",
        "method": "POST",
        "context": "IngestionWorker",
    }
    for canary in (
        GOLDEN_REQUEST_ID,
        "192.0.2.10",
        "client-contract.docx",
        "confidential contract body",
        "synthetic-token",
        "/private/source.py",
        "trace canary",
    ):
        assert canary not in serialized


def test_event_writer_uses_an_exact_bounded_schema() -> None:
    output = StringIO()

    emit_ingestion_event(
        "INGESTION_REQUEST_COMPLETED",
        request_id=GOLDEN_REQUEST_ID,
        outcome="success",
        status="2xx",
        duration_ms=17,
        stream=output,
    )

    assert json.loads(output.getvalue()) == {
        "durationMs": 17,
        "event": "INGESTION_REQUEST_COMPLETED",
        "outcome": "success",
        "requestRef": GOLDEN_REQUEST_REF,
        "status": "2xx",
    }
    assert GOLDEN_REQUEST_ID not in output.getvalue()


def test_worker_middleware_emits_only_a_safe_request_reference(
    monkeypatch,
    capsys,
) -> None:
    monkeypatch.setenv("NODE_ENV", "development")
    monkeypatch.setenv("INGESTION_WORKER_IDENTITY_PROFILE", "loopback-dev")
    request_id = GOLDEN_REQUEST_ID
    nonce = str(uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=3)).replace(microsecond=0)
    isolated_app = FastAPI()
    isolated_app.middleware("http")(enforce_ingestion_service_identity)

    @isolated_app.post("/synthetic-sensitive-path")
    async def synthetic_operation() -> dict[str, str]:
        return {"status": "ok"}

    response = TestClient(isolated_app).post(
        "/synthetic-sensitive-path",
        headers={
            "x-amic-dev-loopback-identity": "true",
            "x-amic-request-id": request_id,
            "x-amic-ingestion-nonce": nonce,
            "x-amic-ingestion-expires-at": expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    )
    output = capsys.readouterr().out
    event = json.loads(output.strip().splitlines()[-1])

    assert response.status_code == 200
    assert event == {
        "durationMs": event["durationMs"],
        "event": "INGESTION_REQUEST_COMPLETED",
        "outcome": "success",
        "requestRef": safe_reference(request_id),
        "status": "2xx",
    }
    assert isinstance(event["durationMs"], int)
    assert event["durationMs"] >= 0
    assert request_id not in output
    assert nonce not in output
    assert "synthetic-sensitive-path" not in output
