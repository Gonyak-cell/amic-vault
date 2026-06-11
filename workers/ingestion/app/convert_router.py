from typing import Annotated

from fastapi import APIRouter, File, Form, Header, HTTPException, Response, UploadFile

from .converters.docx_to_pdf import DocxToPdfConversionError, convert_docx_bytes_to_pdf

router = APIRouter()


@router.post("/convert/docx-to-pdf")
async def convert_docx_to_pdf(
    tenant_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> Response:
    if not x_amic_tenant_id or x_amic_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})
    filename = (file.filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()
    if not filename.endswith(".docx"):
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})

    payload = await file.read()
    try:
        pdf = convert_docx_bytes_to_pdf(payload)
    except DocxToPdfConversionError:
        raise HTTPException(
            status_code=503,
            detail={"code": "VALIDATION_FAILED", "reason": "PREVIEW_CONVERSION_UNAVAILABLE"},
        )
    return Response(content=pdf, media_type="application/pdf")
