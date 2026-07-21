from __future__ import annotations

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from docx import Document
from fastapi.testclient import TestClient

from app.main import app

TENANT_ID = "11111111-1111-4111-8111-111111111111"
VERSION_ID = "11111111-1111-4111-8111-111111111155"

client = TestClient(app)


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
    response = client.post(
        "/extract-revisions",
        data={"tenant_id": TENANT_ID, "version_id": VERSION_ID},
        files={
            "file": (
                "markup.docx",
                _revision_docx(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
        },
        headers={"x-amic-tenant-id": TENANT_ID},
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
