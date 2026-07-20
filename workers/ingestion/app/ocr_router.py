from typing import Annotated

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

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
async def ocr(
    tenant_id: Annotated[str, Form()],
    version_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> OcrResponse:
    if not x_amic_tenant_id or x_amic_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})
    if not version_id:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED"})

    result = extract_ocr(await file.read(), file.filename or "")
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
