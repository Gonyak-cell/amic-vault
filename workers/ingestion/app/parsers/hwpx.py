from io import BytesIO
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree

from .types import ExtractionResult


def _section_sort_key(name: str) -> tuple[int, str]:
    digits = "".join(ch for ch in name if ch.isdigit())
    return (int(digits) if digits else 0, name)


def _text_from_xml(xml: bytes) -> list[str]:
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError:
        return []
    parts: list[str] = []
    for node in root.iter():
        if node.text and node.text.strip():
            parts.append(node.text.strip())
    return parts


def extract_hwpx(payload: bytes) -> ExtractionResult:
    try:
        archive = ZipFile(BytesIO(payload))
    except BadZipFile:
        return ExtractionResult.failed("failed", "HWPX_ZIP_INVALID")

    with archive:
        names = archive.namelist()
        section_names = sorted(
            (
                name
                for name in names
                if name.startswith("Contents/section") and name.lower().endswith(".xml")
            ),
            key=_section_sort_key,
        )
        if not section_names:
            return ExtractionResult.failed("hwpx", "HWPX_SECTION_MISSING")

        parts: list[str] = []
        for section_name in section_names:
            parts.extend(_text_from_xml(archive.read(section_name)))

    body_text = "\n".join(parts).strip()
    if not body_text:
        return ExtractionResult.failed("hwpx", "HWPX_TEXT_EMPTY")
    return ExtractionResult.ready("hwpx", body_text)
