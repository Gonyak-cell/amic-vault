from __future__ import annotations

import csv
from html.parser import HTMLParser
from io import StringIO

from .types import ExtractionResult

try:
    import chardet
except ImportError:
    chardet = None


class _TextCollectingHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style"}:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style"} and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return
        text = " ".join(data.split())
        if text:
            self._parts.append(text)

    def text(self) -> str:
        return "\n".join(self._parts).strip()


def _decode_text(payload: bytes) -> str | None:
    if payload.startswith(b"\xfe\xff"):
        return payload.decode("utf-16-be", errors="replace").lstrip("\ufeff")
    if payload.startswith(b"\xff\xfe"):
        return payload.decode("utf-16-le", errors="replace").lstrip("\ufeff")
    if payload.startswith(b"\xef\xbb\xbf"):
        return payload.decode("utf-8-sig", errors="replace")
    if b"\x00" in payload:
        return None

    encodings: list[str] = []
    if chardet is not None:
        detected = chardet.detect(payload)
        encoding = detected.get("encoding") if detected else None
        confidence = detected.get("confidence") if detected else 0
        if isinstance(encoding, str) and isinstance(confidence, (int, float)) and confidence >= 0.5:
            encodings.append(encoding)
    encodings.extend(["utf-8", "cp949"])

    for encoding in encodings:
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return None


def extract_plaintext(payload: bytes, extraction_method: str) -> ExtractionResult:
    text = _decode_text(payload)
    if text is None:
        return ExtractionResult.failed(extraction_method, "TEXT_DECODE_FAILED")
    body_text = text.strip()
    if not body_text:
        return ExtractionResult.failed(extraction_method, "TEXT_EMPTY")
    return ExtractionResult.ready(extraction_method, body_text)


def extract_csv(payload: bytes) -> ExtractionResult:
    text = _decode_text(payload)
    if text is None:
        return ExtractionResult.failed("csv", "TEXT_DECODE_FAILED")
    rows: list[str] = []
    try:
        for row in csv.reader(StringIO(text)):
            cells = [" ".join(cell.split()) for cell in row]
            rendered = " | ".join(cell for cell in cells if cell)
            if rendered:
                rows.append(rendered)
    except csv.Error:
        return ExtractionResult.failed("csv", "CSV_PARSE_FAILED")
    body_text = "\n".join(rows).strip()
    if not body_text:
        return ExtractionResult.failed("csv", "TEXT_EMPTY")
    return ExtractionResult.ready("csv", body_text)


def extract_html(payload: bytes) -> ExtractionResult:
    text = _decode_text(payload)
    if text is None:
        return ExtractionResult.failed("html", "TEXT_DECODE_FAILED")
    parser = _TextCollectingHtmlParser()
    try:
        parser.feed(text)
        parser.close()
    except Exception:
        return ExtractionResult.failed("html", "HTML_PARSE_FAILED")
    body_text = parser.text()
    if not body_text:
        return ExtractionResult.failed("html", "TEXT_EMPTY")
    return ExtractionResult.ready("html", body_text)
