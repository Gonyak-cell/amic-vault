from dataclasses import dataclass


@dataclass(frozen=True)
class ExtractionResult:
    status: str
    extraction_method: str
    body_text: str
    confidence: float
    failure_reason_code: str | None = None

    @staticmethod
    def ready(extraction_method: str, body_text: str, confidence: float = 1.0) -> "ExtractionResult":
        return ExtractionResult(
            status="ready",
            extraction_method=extraction_method,
            body_text=body_text,
            confidence=confidence,
        )

    @staticmethod
    def ocr_pending() -> "ExtractionResult":
        return ExtractionResult(
            status="ocr_pending",
            extraction_method="ocr_required",
            body_text="",
            confidence=0.0,
        )

    @staticmethod
    def failed(extraction_method: str, reason_code: str) -> "ExtractionResult":
        return ExtractionResult(
            status="failed",
            extraction_method=extraction_method,
            body_text="",
            confidence=0.0,
            failure_reason_code=reason_code,
        )
