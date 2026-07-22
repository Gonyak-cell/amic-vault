from re import fullmatch
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from .security.clamav_client import ClamAvClient

router = APIRouter()
MAX_SCAN_BYTES = 25 * 1024 * 1024


class ScanResponse(BaseModel):
    outcome: str
    engine_version: str | None = None
    signature_age_seconds: int | None = None


@router.post("/security/scan", response_model=ScanResponse)
async def scan(
    quarantine_ref: Annotated[str, Form()],
    expected_sha256: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> ScanResponse:
    try:
        UUID(quarantine_ref)
        UUID(x_amic_tenant_id or "")
    except ValueError:
        raise HTTPException(status_code=403, detail={"code": "PERMISSION_DENIED"}) from None
    if fullmatch(r"[a-f0-9]{64}", expected_sha256) is None:
        raise HTTPException(status_code=403, detail={"code": "PERMISSION_DENIED"})
    payload = await file.read(MAX_SCAN_BYTES + 1)
    if len(payload) > MAX_SCAN_BYTES:
        raise HTTPException(status_code=413, detail={"code": "VALIDATION_FAILED"})
    verdict = ClamAvClient().scan(payload)
    return ScanResponse(
        outcome=verdict.outcome,
        engine_version=verdict.engine_version,
        signature_age_seconds=verdict.signature_age_seconds,
    )
