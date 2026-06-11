from io import BytesIO

from pypdf import PdfReader

from .types import ExtractionResult


def extract_pdf(payload: bytes) -> ExtractionResult:
    try:
        reader = PdfReader(BytesIO(payload))
    except Exception:
        return ExtractionResult.failed("failed", "PDF_PARSE_FAILED")

    if reader.is_encrypted:
        return ExtractionResult.failed("failed", "ENCRYPTED_PDF")

    parts: list[str] = []
    try:
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                parts.append(text.strip())
    except Exception:
        return ExtractionResult.failed("failed", "PDF_PARSE_FAILED")

    body_text = "\n\n".join(parts).strip()
    if not body_text:
        return ExtractionResult.ocr_pending()
    return ExtractionResult.ready("pdf_text", body_text)
