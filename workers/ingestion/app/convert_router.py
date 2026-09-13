from typing import Annotated

from fastapi import APIRouter, File, Form, Header, HTTPException, Response, UploadFile

from .converters.docx_to_pdf import (
    DocxToPdfConversionError,
    convert_docx_bytes_to_pdf,
    convert_office_bytes_to_pdf,
    office_converter_profile_sha256,
    office_pdf_extensions,
)
from .resource_policy import ParserLimitExceeded, assert_input_bytes, parser_profile

router = APIRouter()


@router.get("/convert/office-to-pdf/profile")
def office_to_pdf_profile(
    response: Response,
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> dict[str, str]:
    if not x_amic_tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})
    response.headers["cache-control"] = "no-store"
    try:
        return {"profile_sha256": office_converter_profile_sha256()}
    except DocxToPdfConversionError:
        raise HTTPException(
            status_code=503,
            detail={"code": "VALIDATION_FAILED", "reason": "PREVIEW_CONVERSION_UNAVAILABLE"},
        )


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

    profile = parser_profile("convert")
    payload = await file.read(profile.max_input_bytes + 1)
    try:
        assert_input_bytes(profile, len(payload))
        pdf = convert_docx_bytes_to_pdf(payload)
    except (DocxToPdfConversionError, ParserLimitExceeded):
        raise HTTPException(
            status_code=503,
            detail={"code": "VALIDATION_FAILED", "reason": "PREVIEW_CONVERSION_UNAVAILABLE"},
        )
    return Response(content=pdf, media_type="application/pdf")


@router.post("/convert/office-to-pdf")
async def convert_office_to_pdf(
    tenant_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
    x_amic_converter_profile: Annotated[
        str | None, Header(alias="x-amic-converter-profile")
    ] = None,
) -> Response:
    if not x_amic_tenant_id or x_amic_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})
    filename = (file.filename or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()
    extension = filename.rsplit(".", 1)[-1] if "." in filename else ""
    if extension not in office_pdf_extensions:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})

    profile = parser_profile("convert")
    payload = await file.read(profile.max_input_bytes + 1)
    try:
        assert_input_bytes(profile, len(payload))
        converter_profile = office_converter_profile_sha256()
        if x_amic_converter_profile is not None and x_amic_converter_profile != converter_profile:
            raise DocxToPdfConversionError("converter profile changed")
        pdf = convert_office_bytes_to_pdf(payload, filename)
    except (DocxToPdfConversionError, ParserLimitExceeded):
        raise HTTPException(
            status_code=503,
            detail={"code": "VALIDATION_FAILED", "reason": "PREVIEW_CONVERSION_UNAVAILABLE"},
        )
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"x-amic-converter-profile": converter_profile},
    )
