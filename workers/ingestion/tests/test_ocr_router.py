from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from reportlab.pdfgen import canvas

from app import extract_router, ocr_router
from app.main import app
from app.parsers import ocr as ocr_parser
from app.storage_client import WorkerStoredObject

TENANT_ID = "11111111-1111-4111-8111-111111111111"
VERSION_ID = "11111111-1111-4111-8111-111111111155"
MATTER_ID = "11111111-1111-4111-8111-111111111122"
DOCUMENT_ID = "11111111-1111-4111-8111-111111111133"
FILE_OBJECT_ID = "11111111-1111-4111-8111-111111111144"

client = TestClient(app)
_stored_objects: dict[str, WorkerStoredObject] = {}


def _loopback_identity_headers() -> dict[str, str]:
    request_id = str(uuid4())
    nonce = str(uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=3)).replace(microsecond=0)
    return {
        "x-amic-dev-loopback-identity": "true",
        "x-amic-request-id": request_id,
        "x-amic-ingestion-nonce": nonce,
        "x-amic-ingestion-expires-at": expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def _fake_read_ingestion_object(job):
    return _stored_objects[job.objectKey]


def _post_ocr(filename: str, payload: bytes, tenant_id: str = TENANT_ID):
    request_id = str(uuid4())
    nonce = str(uuid4())
    object_key = f"tenants/{tenant_id}/matters/{MATTER_ID}/documents/{DOCUMENT_ID}/{FILE_OBJECT_ID}"
    content_type = {"pdf": "application/pdf", "png": "image/png"}[filename.rsplit(".", 1)[-1]]
    _stored_objects[object_key] = WorkerStoredObject(payload, content_type)
    app.state.ingestion_storage_reader = _fake_read_ingestion_object
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=3)).replace(microsecond=0)
    expires_at_value = expires_at.strftime("%Y-%m-%dT%H:%M:%SZ")
    return client.post(
        "/ocr",
        json={
            "tenantId": tenant_id,
            "documentId": DOCUMENT_ID,
            "versionId": VERSION_ID,
            "fileObjectId": FILE_OBJECT_ID,
            "storageAlias": "primary",
            "objectKey": object_key,
            "objectVersion": "b" * 64,
            "sha256": sha256(payload).hexdigest(),
            "sizeBytes": len(payload),
            "parserProfile": "ocr",
            "requestId": request_id,
            "expiresAt": expires_at_value,
        },
        headers={
            "x-amic-dev-loopback-identity": "true",
            "x-amic-request-id": request_id,
            "x-amic-ingestion-nonce": nonce,
            "x-amic-ingestion-expires-at": expires_at_value,
        },
    )


def _text_pdf(text: str) -> bytes:
    buffer = BytesIO()
    page = canvas.Canvas(buffer)
    page.drawString(72, 720, text)
    page.showPage()
    page.save()
    return buffer.getvalue()


def _blank_pdf() -> bytes:
    buffer = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.write(buffer)
    return buffer.getvalue()


def test_ocr_skips_pdf_with_text_layer() -> None:
    response = _post_ocr("fixture.pdf", _text_pdf("Already extracted"))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "failed"
    assert body["extraction_method"] == "ocr"
    assert body["failure_reason_code"] == "TEXT_LAYER_PRESENT"
    assert body["body_text"] == ""


def test_ocr_extracts_scanned_pdf_pages_with_injected_engine(monkeypatch) -> None:
    monkeypatch.setattr(ocr_parser, "rasterize_pdf_pages", lambda _payload: [b"page-1", b"page-2"])
    monkeypatch.setattr(
        ocr_parser,
        "tesseract_text",
        lambda payload, _extension: "스캔 계약서" if payload == b"page-1" else "Second page",
    )

    response = _post_ocr("scan.pdf", _blank_pdf())

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ready"
    assert body["extraction_method"] == "ocr"
    assert body["confidence"] == 0.7
    assert "스캔 계약서" in body["body_text"]
    assert "Second page" in body["body_text"]
    assert body["pages"] == [
        {"page": 1, "text": "스캔 계약서", "confidence": 0.7},
        {"page": 2, "text": "Second page", "confidence": 0.7},
    ]


def test_ocr_extracts_png_with_injected_engine(monkeypatch) -> None:
    monkeypatch.setattr(
        ocr_parser,
        "tesseract_text",
        lambda payload, extension: "한국어 PNG 증빙" if payload == b"png-payload" and extension == "png" else "",
    )

    response = _post_ocr("scan.png", b"png-payload")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ready"
    assert body["extraction_method"] == "ocr"
    assert body["confidence"] == 0.7
    assert body["body_text"] == "한국어 PNG 증빙"
    assert body["pages"] == [{"page": 1, "text": "한국어 PNG 증빙", "confidence": 0.7}]


def test_ocr_tenant_header_mismatch_fails_closed() -> None:
    headers = _loopback_identity_headers()
    response = client.post(
        "/ocr",
        json={},
        headers={**headers, "x-amic-tenant-id": "22222222-2222-4222-8222-222222222222"},
    )

    assert response.status_code == 400
    assert "VALIDATION_FAILED" in response.text
