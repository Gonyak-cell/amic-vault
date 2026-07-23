from __future__ import annotations

from hashlib import sha256
from io import BytesIO
from typing import Annotated
from zipfile import BadZipFile, ZipFile

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel
from .resource_policy import (
    ParserLimitExceeded,
    assert_input_bytes,
    assert_output_bytes,
    assert_wall_time,
    parser_profile,
    start_wall_clock,
    validate_archive_members,
)

router = APIRouter()

_ZIP_PROFILE = parser_profile("zip")
MAX_ZIP_ITEMS = _ZIP_PROFILE.max_archive_members
MAX_ZIP_UNCOMPRESSED_BYTES = _ZIP_PROFILE.max_expanded_bytes
MAX_ZIP_COMPRESSION_RATIO = _ZIP_PROFILE.max_compression_ratio


class ZipItem(BaseModel):
    path: str
    size_bytes: int
    compressed_size_bytes: int
    sha256: str


class ZipInspectResponse(BaseModel):
    status: str
    item_count: int
    items: list[ZipItem]


def _reject(reason: str) -> None:
    raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED", "reason": reason})


def inspect_zip_payload(payload: bytes) -> list[ZipItem]:
    started_at = start_wall_clock()
    if not payload.startswith(b"PK"):
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})
    try:
        assert_input_bytes(_ZIP_PROFILE, len(payload))
        with ZipFile(BytesIO(payload)) as archive:
            items: list[ZipItem] = []
            for info, safe_path in validate_archive_members(
                _ZIP_PROFILE,
                archive.infolist(),
            ):
                body = archive.read(info)
                if len(body) != info.file_size:
                    raise ParserLimitExceeded("ZIP_MEMBER_SIZE_MISMATCH")
                assert_output_bytes(_ZIP_PROFILE, body)
                items.append(
                    ZipItem(
                        path=safe_path,
                        size_bytes=info.file_size,
                        compressed_size_bytes=info.compress_size,
                        sha256=sha256(body).hexdigest(),
                    )
                )
            assert_wall_time(_ZIP_PROFILE, started_at)
            return items
    except ParserLimitExceeded as exc:
        _reject(exc.reason_code)
    except BadZipFile as exc:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"}) from exc


@router.post("/zip/inspect", response_model=ZipInspectResponse)
async def inspect_zip(
    tenant_id: Annotated[str, Form()],
    batch_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> ZipInspectResponse:
    if not x_amic_tenant_id or x_amic_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})
    if not batch_id:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED"})
    payload = await file.read(_ZIP_PROFILE.max_input_bytes + 1)
    items = inspect_zip_payload(payload)
    return ZipInspectResponse(status="ready", item_count=len(items), items=items)
