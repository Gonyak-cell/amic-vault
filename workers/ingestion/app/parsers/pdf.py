from io import BytesIO

from pypdf import PdfReader

from app.resource_policy import (
    ParserLimitExceeded,
    assert_input_bytes,
    assert_output_text,
    assert_page_count,
    assert_wall_time,
    parser_profile,
    start_wall_clock,
)

from .types import ExtractionResult


def extract_pdf(payload: bytes) -> ExtractionResult:
    profile = parser_profile("extract")
    started_at = start_wall_clock()
    try:
        assert_input_bytes(profile, len(payload))
        reader = PdfReader(BytesIO(payload))
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("pdf_text", exc.reason_code)
    except Exception:
        return ExtractionResult.failed("failed", "PDF_PARSE_FAILED")

    if reader.is_encrypted:
        return ExtractionResult.failed("failed", "ENCRYPTED_PDF")

    parts: list[str] = []
    try:
        assert_page_count(profile, len(reader.pages))
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                parts.append(text.strip())
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("pdf_text", exc.reason_code)
    except Exception:
        return ExtractionResult.failed("failed", "PDF_PARSE_FAILED")

    body_text = "\n\n".join(parts).strip()
    if not body_text:
        return ExtractionResult.ocr_pending()
    try:
        assert_output_text(profile, body_text)
        assert_wall_time(profile, started_at)
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("pdf_text", exc.reason_code)
    return ExtractionResult.ready("pdf_text", body_text)
