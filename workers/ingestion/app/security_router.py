from typing import Annotated

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

from .security.clamav_client import ClamAvClient

router = APIRouter()


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
    if not x_amic_tenant_id or len(quarantine_ref) != 36 or len(expected_sha256) != 64:
        raise HTTPException(status_code=403, detail={"code": "PERMISSION_DENIED"})
    payload = await file.read(25 * 1024 * 1024 + 1)
    verdict = ClamAvClient().scan(payload)
    return ScanResponse(
        outcome=verdict.outcome,
        engine_version=verdict.engine_version,
        signature_age_seconds=verdict.signature_age_seconds,
    )
