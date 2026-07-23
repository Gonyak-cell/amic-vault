from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from io import BytesIO
from uuid import uuid4

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.annotations import FreeText, Highlight, Text
from pypdf.generic import ArrayObject, FloatObject, NameObject, TextStringObject

from app import extract_router
from app.main import app
from app.storage_client import WorkerStoredObject

TENANT_ID = "11111111-1111-4111-8111-111111111111"
VERSION_ID = "11111111-1111-4111-8111-111111111155"
MATTER_ID = "11111111-1111-4111-8111-111111111122"
DOCUMENT_ID = "11111111-1111-4111-8111-111111111133"
FILE_OBJECT_ID = "11111111-1111-4111-8111-111111111144"

client = TestClient(app)
_stored_objects: dict[str, WorkerStoredObject] = {}


def _annotated_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer.add_annotation(
        0,
        Text(
            rect=(10, 140, 35, 165),
            text="Sticky note content",
        ),
    )
    writer.add_annotation(
        0,
        FreeText(
            text="Free text clause",
            rect=(40, 90, 160, 125),
        ),
    )
    highlight = Highlight(
        rect=(40, 50, 160, 70),
        quad_points=ArrayObject(
            [
                FloatObject(40),
                FloatObject(70),
                FloatObject(160),
                FloatObject(70),
                FloatObject(40),
                FloatObject(50),
                FloatObject(160),
                FloatObject(50),
            ],
        ),
    )
    highlight[NameObject("/Contents")] = TextStringObject("Highlighted covenant")
    highlight[NameObject("/T")] = TextStringObject("Reviewer")
    writer.add_annotation(0, highlight)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def test_extract_annotations_returns_pdf_annotation_types_and_content() -> None:
    payload = _annotated_pdf()
    request_id = str(uuid4())
    nonce = str(uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=3)).replace(microsecond=0)
    expires_at_value = expires_at.strftime("%Y-%m-%dT%H:%M:%SZ")
    object_key = f"tenants/{TENANT_ID}/matters/{MATTER_ID}/documents/{DOCUMENT_ID}/{FILE_OBJECT_ID}"
    _stored_objects[object_key] = WorkerStoredObject(payload, "application/pdf")
    app.state.ingestion_storage_reader = lambda job: _stored_objects[job.objectKey]
    response = client.post(
        "/extract-annotations",
        json={
            "tenantId": TENANT_ID,
            "documentId": DOCUMENT_ID,
            "versionId": VERSION_ID,
            "fileObjectId": FILE_OBJECT_ID,
            "storageAlias": "primary",
            "objectKey": object_key,
            "objectVersion": "b" * 64,
            "sha256": sha256(payload).hexdigest(),
            "sizeBytes": len(payload),
            "parserProfile": "extract",
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

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ready"
    annotations = body["annotations"]
    assert any(
        item["annotation_type"] == "text" and item["contents"] == "Sticky note content"
        for item in annotations
    )
    assert any(
        item["annotation_type"] == "freetext" and item["contents"] == "Free text clause"
        for item in annotations
    )
    assert any(
        item["annotation_type"] == "highlight"
        and item["contents"] == "Highlighted covenant"
        and item["author"] == "Reviewer"
        and item["page"] == 1
        for item in annotations
    )
