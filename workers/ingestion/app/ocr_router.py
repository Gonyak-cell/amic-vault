from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .extract_router import _extension_from_stored_object, _read_validated_stored_object
from .parsers.ocr import extract_ocr

router = APIRouter()


class OcrPageResponse(BaseModel):
    page: int
    text: str
    confidence: float


class OcrResponse(BaseModel):
    status: str
    extraction_method: str
    body_text: str = Field(default="")
    confidence: float
    failure_reason_code: str | None = None
    pages: list[OcrPageResponse] = Field(default_factory=list)


@router.post("/ocr", response_model=OcrResponse)
async def ocr(request: Request) -> OcrResponse:
    _, stored = await _read_validated_stored_object(request, "ocr")
    extension = _extension_from_stored_object(stored)
    if extension not in {"pdf", "png", "jpg", "jpeg"}:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})
    result = extract_ocr(stored.body, f"object.{extension}")
    return OcrResponse(
        status=result.status,
        extraction_method=result.extraction_method,
        body_text=result.body_text if result.status == "ready" else "",
        confidence=result.confidence,
        failure_reason_code=result.failure_reason_code,
        pages=[
            OcrPageResponse(page=page.page, text=page.text, confidence=page.confidence)
            for page in result.pages
        ]
        if result.status == "ready"
        else [],
    )
