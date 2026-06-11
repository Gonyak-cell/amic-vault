from typing import Annotated

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .parsers.docx import extract_docx
from .parsers.hwpx import extract_hwpx
from .parsers.pdf import extract_pdf
from .parsers.types import ExtractionResult

router = APIRouter()


class ExtractResponse(BaseModel):
    status: str
    extraction_method: str
    body_text: str = Field(default="")
    confidence: float
    failure_reason_code: str | None = None


def _extension(filename: str) -> str:
    name = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()
    if "." not in name:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})
    return name.rsplit(".", 1)[-1]


def _parse(ext: str, payload: bytes) -> ExtractionResult:
    if payload.startswith(b"\xd0\xcf\x11\xe0"):
        return ExtractionResult.failed("failed", "UNSUPPORTED_HWP_BINARY")
    if ext == "pdf":
        return extract_pdf(payload)
    if ext == "docx":
        return extract_docx(payload)
    if ext == "hwpx":
        return extract_hwpx(payload)
    raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})


@router.post("/extract", response_model=ExtractResponse)
async def extract(
    tenant_id: Annotated[str, Form()],
    version_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> ExtractResponse:
    if not x_amic_tenant_id or x_amic_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})
    if not version_id:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED"})

    payload = await file.read()
    result = _parse(_extension(file.filename or ""), payload)
    return ExtractResponse(
        status=result.status,
        extraction_method=result.extraction_method,
        body_text=result.body_text if result.status == "ready" else "",
        confidence=result.confidence,
        failure_reason_code=result.failure_reason_code,
    )
