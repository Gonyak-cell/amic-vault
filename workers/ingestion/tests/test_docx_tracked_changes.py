from __future__ import annotations

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from docx import Document

from app.parsers.docx import extract_docx
from app.parsers.docx_revisions import extract_docx_revisions


def _docx_payload(paragraphs: list[str], injected_body_xml: str = "") -> bytes:
    document = Document()
    for paragraph in paragraphs:
        document.add_paragraph(paragraph)
    buffer = BytesIO()
    document.save(buffer)
    if not injected_body_xml:
        return buffer.getvalue()

    source = BytesIO(buffer.getvalue())
    output = BytesIO()
    with ZipFile(source) as src, ZipFile(output, "w", ZIP_DEFLATED) as dst:
        for info in src.infolist():
            raw = src.read(info.filename)
            if info.filename == "word/document.xml":
                xml = raw.decode("utf-8")
                xml = xml.replace("</w:body>", f"{injected_body_xml}</w:body>")
                raw = xml.encode("utf-8")
            dst.writestr(info, raw)
    return output.getvalue()


def test_docx_tracked_changes_preserve_insert_delete_text_and_order() -> None:
    payload = _docx_payload(
        ["Opening clause"],
        (
            '<w:p>'
            '<w:r><w:t>Negotiation baseline </w:t></w:r>'
            '<w:ins w:author="Counterparty" w:date="2026-07-05T01:02:03Z">'
            '<w:r><w:t>new liability cap</w:t></w:r>'
            '</w:ins>'
            '<w:r><w:t> then </w:t></w:r>'
            '<w:del w:author="Client" w:date="2026-07-05T02:03:04Z">'
            '<w:r><w:delText>old indemnity carveout</w:delText></w:r>'
            '</w:del>'
            '</w:p>'
        ),
    )

    revisions = extract_docx_revisions(payload)

    assert [revision.change_type for revision in revisions[:2]] == ["insert", "delete"]
    assert revisions[0].author == "Counterparty"
    assert revisions[0].date == "2026-07-05T01:02:03Z"
    assert revisions[0].before_text == ""
    assert revisions[0].after_text == "new liability cap"
    assert revisions[1].author == "Client"
    assert revisions[1].date == "2026-07-05T02:03:04Z"
    assert revisions[1].before_text == "old indemnity carveout"
    assert revisions[1].after_text == ""


def test_docx_without_tracked_changes_keeps_existing_text_extraction_fallback() -> None:
    payload = _docx_payload(["Plain agreement body", "No counterparty markup"])

    revisions = extract_docx_revisions(payload)
    extraction = extract_docx(payload)

    assert revisions == []
    assert extraction.status == "ready"
    assert extraction.extraction_method == "docx"
    assert extraction.body_text == "Plain agreement body\nNo counterparty markup"
