from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from io import BytesIO
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from docx import Document
from fastapi.testclient import TestClient

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


def _revision_docx() -> bytes:
    document = Document()
    document.add_paragraph("Base paragraph")
    buffer = BytesIO()
    document.save(buffer)
    source = BytesIO(buffer.getvalue())
    output = BytesIO()
    revision_xml = (
        '<w:p>'
        '<w:r><w:t>Base paragraph </w:t></w:r>'
        '<w:ins w:author="Opposing Counsel" w:date="2026-07-04T01:02:03Z">'
        '<w:r><w:t>Inserted covenant</w:t></w:r>'
        '</w:ins>'
        '<w:del w:author="Client" w:date="2026-07-04T02:03:04Z">'
        '<w:r><w:delText>Deleted indemnity</w:delText></w:r>'
        '</w:del>'
        '<w:r>'
        '<w:rPr>'
        '<w:rPrChange w:author="Reviewer" w:date="2026-07-04T03:04:05Z">'
        '<w:rPr><w:b /></w:rPr>'
        '</w:rPrChange>'
        '</w:rPr>'
        '<w:t>Formatted notice</w:t>'
        '</w:r>'
        '</w:p>'
    )
    with ZipFile(source) as src, ZipFile(output, "w", ZIP_DEFLATED) as dst:
        for info in src.infolist():
            raw = src.read(info.filename)
            if info.filename == "word/document.xml":
                xml = raw.decode("utf-8")
                xml = xml.replace("</w:body>", f"{revision_xml}</w:body>")
                raw = xml.encode("utf-8")
            dst.writestr(info, raw)
    return output.getvalue()


def test_extract_revisions_returns_insert_delete_and_format_changes() -> None:
    payload = _revision_docx()
    request_id = str(uuid4())
    nonce = str(uuid4())
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=3)).replace(microsecond=0)
    expires_at_value = expires_at.strftime("%Y-%m-%dT%H:%M:%SZ")
    object_key = f"tenants/{TENANT_ID}/matters/{MATTER_ID}/documents/{DOCUMENT_ID}/{FILE_OBJECT_ID}"
    _stored_objects[object_key] = WorkerStoredObject(
        payload, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    app.state.ingestion_storage_reader = lambda job: _stored_objects[job.objectKey]
    response = client.post(
        "/extract-revisions",
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
    revisions = body["revisions"]
    assert {
        "change_type": "insert",
        "author": "Opposing Counsel",
        "date": "2026-07-04T01:02:03Z",
        "before_text": "",
        "after_text": "Inserted covenant",
    } in revisions
    assert {
        "change_type": "delete",
        "author": "Client",
        "date": "2026-07-04T02:03:04Z",
        "before_text": "Deleted indemnity",
        "after_text": "",
    } in revisions
    assert {
        "change_type": "format",
        "author": "Reviewer",
        "date": "2026-07-04T03:04:05Z",
        "before_text": "",
        "after_text": "Formatted notice",
    } in revisions
