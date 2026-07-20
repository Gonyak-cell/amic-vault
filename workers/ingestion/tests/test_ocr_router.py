from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from reportlab.pdfgen import canvas

from app.main import app
from app.parsers import ocr as ocr_parser

TENANT_ID = "11111111-1111-4111-8111-111111111111"
VERSION_ID = "11111111-1111-4111-8111-111111111155"

client = TestClient(app)


def _post_ocr(filename: str, payload: bytes, tenant_id: str = TENANT_ID):
    return client.post(
        "/ocr",
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
    response = client.post(
        "/ocr",
        data={"tenant_id": TENANT_ID, "version_id": VERSION_ID},
        files={"file": ("scan.pdf", _blank_pdf(), "application/pdf")},
        headers={"x-amic-tenant-id": "22222222-2222-4222-8222-222222222222"},
    )

    assert response.status_code == 403
    assert "TENANT_ISOLATION_VIOLATION" in response.text
