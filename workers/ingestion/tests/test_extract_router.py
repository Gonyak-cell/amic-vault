from __future__ import annotations

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from docx import Document
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from reportlab.pdfgen import canvas

from app.main import app

TENANT_ID = "11111111-1111-4111-8111-111111111111"
VERSION_ID = "11111111-1111-4111-8111-111111111155"

client = TestClient(app)


def _post_extract(filename: str, payload: bytes, tenant_id: str = TENANT_ID):
    return client.post(
        "/extract",
        data={"tenant_id": tenant_id, "version_id": VERSION_ID},
        files={"file": (filename, payload, "application/octet-stream")},
        headers={"x-amic-tenant-id": tenant_id},
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


def _encrypted_pdf() -> bytes:
    buffer = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.encrypt("fixture-password")
    writer.write(buffer)
    return buffer.getvalue()


def _docx_with_table_and_footnote() -> bytes:
    document = Document()
    document.add_paragraph("Matter summary paragraph")
    table = document.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Clause"
    table.rows[0].cells[1].text = "Status"
    buffer = BytesIO()
    document.save(buffer)
    source = BytesIO(buffer.getvalue())
    output = BytesIO()
    with ZipFile(source) as src, ZipFile(output, "w", ZIP_DEFLATED) as dst:
        for info in src.infolist():
            dst.writestr(info, src.read(info.filename))
        dst.writestr(
            "word/footnotes.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:id="2"><w:p><w:r><w:t>Footnote fixture text</w:t></w:r></w:p></w:footnote>
</w:footnotes>""",
        )
    return output.getvalue()


def _hwpx(section_texts: list[str]) -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("mimetype", "application/hwp+zip")
        for index, text in enumerate(section_texts):
            archive.writestr(
                f"Contents/section{index}.xml",
                f"""<?xml version="1.0" encoding="UTF-8"?>
<hp:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2016/section">
  <hp:p><hp:run><hp:t>{text}</hp:t></hp:run></hp:p>
</hp:sec>""",
            )
    return output.getvalue()


def test_pdf_text_layer_extraction_preserves_content() -> None:
    response = _post_extract("fixture.pdf", _text_pdf("PDF fixture first page"))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ready"
    assert body["extraction_method"] == "pdf_text"
    assert body["confidence"] == 1.0
    assert "PDF fixture first page" in body["body_text"]


def test_blank_pdf_is_ocr_pending_without_external_ocr() -> None:
    response = _post_extract("blank.pdf", _blank_pdf())
    assert response.status_code == 200, response.text
    assert response.json() == {
        "status": "ocr_pending",
        "extraction_method": "ocr_required",
        "body_text": "",
        "confidence": 0.0,
        "failure_reason_code": None,
    }


def test_encrypted_pdf_returns_explicit_failure_without_body_text() -> None:
    response = _post_extract("encrypted.pdf", _encrypted_pdf())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "failed"
    assert body["failure_reason_code"] == "ENCRYPTED_PDF"
    assert body["body_text"] == ""


def test_docx_extraction_includes_body_table_and_footnote_text() -> None:
    response = _post_extract("fixture.docx", _docx_with_table_and_footnote())
    assert response.status_code == 200, response.text
    body_text = response.json()["body_text"]
    assert "Matter summary paragraph" in body_text
    assert "Clause | Status" in body_text
    assert "Footnote fixture text" in body_text


def test_hwpx_extraction_fixtures_cover_five_deidentified_shapes() -> None:
    fixtures = {
        "basic.hwpx": ["Basic HWPX fixture"],
        "table.hwpx": ["Header A", "Cell B"],
        "image-heavy.hwpx": ["Caption only fixture text"],
        "large.hwpx": [f"Large paragraph {index}" for index in range(25)],
        "legacy.hwpx": ["Legacy style HWPX fixture"],
    }
    for filename, sections in fixtures.items():
        response = _post_extract(filename, _hwpx(sections))
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "ready"
        assert body["extraction_method"] == "hwpx"
        for expected in sections:
            assert expected in body["body_text"]


def test_hwpx_endpoint_rejects_hwp_binary_without_binary_parser() -> None:
    response = _post_extract("binary.hwpx", b"\xd0\xcf\x11\xe0" + b"not-real-document")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "failed"
    assert body["failure_reason_code"] == "UNSUPPORTED_HWP_BINARY"
    assert body["body_text"] == ""


def test_tenant_header_mismatch_fails_closed() -> None:
    response = client.post(
        "/extract",
        data={"tenant_id": TENANT_ID, "version_id": VERSION_ID},
        files={"file": ("fixture.pdf", _text_pdf("Denied"), "application/pdf")},
        headers={"x-amic-tenant-id": "22222222-2222-4222-8222-222222222222"},
    )
    assert response.status_code == 403
    assert "TENANT_ISOLATION_VIOLATION" in response.text
