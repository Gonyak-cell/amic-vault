from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.annotations import FreeText, Highlight, Text
from pypdf.generic import ArrayObject, FloatObject, NameObject, TextStringObject

from app.main import app

TENANT_ID = "11111111-1111-4111-8111-111111111111"
VERSION_ID = "11111111-1111-4111-8111-111111111155"

client = TestClient(app)


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
    response = client.post(
        "/extract-annotations",
        data={"tenant_id": TENANT_ID, "version_id": VERSION_ID},
        files={"file": ("annotated.pdf", _annotated_pdf(), "application/pdf")},
        headers={"x-amic-tenant-id": TENANT_ID},
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
