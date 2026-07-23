from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app

TENANT_ID = "11111111-1111-4111-8111-111111111111"

client = TestClient(app)


def _loopback_identity_headers() -> dict[str, str]:
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=3)).replace(microsecond=0)
    return {
        "x-amic-dev-loopback-identity": "true",
        "x-amic-request-id": str(uuid4()),
        "x-amic-ingestion-nonce": str(uuid4()),
        "x-amic-ingestion-expires-at": expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def _post_email_parse(filename: str, payload: bytes, tenant_id: str = TENANT_ID):
    return client.post(
        "/email/parse",
        data={"tenant_id": tenant_id},
        files={"file": (filename, payload, "message/rfc822")},
        headers={**_loopback_identity_headers(), "x-amic-tenant-id": tenant_id},
    )


def test_email_parse_router_decodes_euc_kr_subject_without_body_text() -> None:
    response = _post_email_parse(
        "encoded-korean.eml",
        "\r\n".join(
            [
                "From: Sender <sender@example.test>",
                "To: Internal <internal@amic.test>",
                "Message-ID: <encoded-korean@example.test>",
                "References: <thread-001@example.test>",
                "Subject: =?EUC-KR?B?sMvF5CC/5MO7?=",
                "",
                "body must not be returned",
            ]
        ).encode("latin1"),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["parser"] == "eml"
    assert body["parser_version"] == "email-worker-v1"
    assert body["parse_status"] == "parsed"
    assert body["normalized_message_id"] == "encoded-korean@example.test"
    assert body["subject"] == "검토 요청"
    assert body["references"] == ["thread-001@example.test"]
    assert body["participants"][0]["domain_ref"] == "example.test"
    assert "body must not be returned" not in response.text


def test_email_parse_router_returns_structured_error_for_broken_eml() -> None:
    response = _post_email_parse("broken.eml", b"Subject: Missing\r\n\r\nraw body")

    assert response.status_code == 200
    body = response.json()
    assert body == {
        "parser": "eml",
        "parser_version": "email-worker-v1",
        "parse_status": "failed",
        "normalized_message_id": None,
        "subject": None,
        "sent_at": None,
        "received_at": None,
        "metadata_warning_code": None,
        "body_text": None,
        "references": [],
        "participants": [],
        "attachments": [],
        "failure_reason_code": "MISSING_MESSAGE_ID",
    }
