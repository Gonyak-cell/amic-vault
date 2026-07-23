from io import BytesIO
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree

from docx import Document

from app.resource_policy import (
    ParserLimitExceeded,
    assert_input_bytes,
    assert_output_text,
    assert_wall_time,
    parser_profile,
    start_wall_clock,
    validate_archive_members,
)

from .types import ExtractionResult

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _iter_block_text(document: Document) -> list[str]:
    parts: list[str] = []
    body = document.element.body
    for child in body.iterchildren():
        if child.tag == f"{W_NS}p":
            text = "".join(node.text or "" for node in child.iter(f"{W_NS}t")).strip()
            if text:
                parts.append(text)
        elif child.tag == f"{W_NS}tbl":
            for row in child.iter(f"{W_NS}tr"):
                cells: list[str] = []
                for cell in row.iter(f"{W_NS}tc"):
                    cell_text = " ".join(
                        (node.text or "").strip()
                        for node in cell.iter(f"{W_NS}t")
                        if (node.text or "").strip()
                    )
                    if cell_text:
                        cells.append(cell_text)
                if cells:
                    parts.append(" | ".join(cells))
    return parts


def _footnote_text(payload: bytes) -> list[str]:
    try:
        with ZipFile(BytesIO(payload)) as archive:
            raw = archive.read("word/footnotes.xml")
    except (KeyError, BadZipFile):
        return []

    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError:
        return []

    notes: list[str] = []
    for footnote in root.findall(f"{W_NS}footnote"):
        note_type = footnote.attrib.get(f"{W_NS}type")
        if note_type in {"separator", "continuationSeparator"}:
            continue
        text = " ".join(
            (node.text or "").strip()
            for node in footnote.iter(f"{W_NS}t")
            if (node.text or "").strip()
        )
        if text:
            notes.append(text)
    return notes


def extract_docx(payload: bytes) -> ExtractionResult:
    profile = parser_profile("extract")
    started_at = start_wall_clock()
    try:
        assert_input_bytes(profile, len(payload))
        with ZipFile(BytesIO(payload)) as archive:
            validate_archive_members(profile, archive.infolist())
        document = Document(BytesIO(payload))
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("docx", exc.reason_code)
    except Exception:
        return ExtractionResult.failed("failed", "PROTECTED_DOCX_OR_INVALID")

    parts = _iter_block_text(document)
    parts.extend(_footnote_text(payload))
    body_text = "\n".join(parts).strip()
    if not body_text:
        return ExtractionResult.failed("docx", "DOCX_TEXT_EMPTY")
    try:
        assert_output_text(profile, body_text)
        assert_wall_time(profile, started_at)
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("docx", exc.reason_code)
    return ExtractionResult.ready("docx", body_text)
