from io import BytesIO
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree

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
    profile = parser_profile("extract")
    started_at = start_wall_clock()
    try:
        assert_input_bytes(profile, len(payload))
        archive = ZipFile(BytesIO(payload))
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("hwpx", exc.reason_code)
    except BadZipFile:
        return ExtractionResult.failed("failed", "HWPX_ZIP_INVALID")

    with archive:
        try:
            accepted = validate_archive_members(profile, archive.infolist())
        except ParserLimitExceeded as exc:
            return ExtractionResult.failed("hwpx", exc.reason_code)
        names = [name for _, name in accepted]
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
    try:
        assert_output_text(profile, body_text)
        assert_wall_time(profile, started_at)
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("hwpx", exc.reason_code)
    return ExtractionResult.ready("hwpx", body_text)
