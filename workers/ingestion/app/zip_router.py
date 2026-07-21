from __future__ import annotations

from hashlib import sha256
from io import BytesIO
from pathlib import PurePosixPath
from typing import Annotated
from zipfile import BadZipFile, ZipFile

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter()

MAX_ZIP_ITEMS = 5000
MAX_ZIP_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024
MAX_ZIP_COMPRESSION_RATIO = 100


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


def _assert_safe_member(name: str) -> str:
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    if not normalized or path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        _reject("ZIP_PATH_TRAVERSAL")
    return path.as_posix()


def inspect_zip_payload(payload: bytes) -> list[ZipItem]:
    if not payload.startswith(b"PK"):
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})
    try:
        with ZipFile(BytesIO(payload)) as archive:
            items: list[ZipItem] = []
            total_uncompressed = 0
            for info in archive.infolist():
                if info.is_dir():
                    continue
                if len(items) >= MAX_ZIP_ITEMS:
                    _reject("ZIP_ITEM_COUNT_EXCEEDED")
                safe_path = _assert_safe_member(info.filename)
                if info.flag_bits & 0x1:
                    _reject("ZIP_ENCRYPTED_ENTRY")
                if info.file_size > 0 and info.compress_size == 0:
                    _reject("ZIP_COMPRESSION_RATIO_EXCEEDED")
                if (
                    info.compress_size > 0
                    and info.file_size / info.compress_size > MAX_ZIP_COMPRESSION_RATIO
                ):
                    _reject("ZIP_COMPRESSION_RATIO_EXCEEDED")
                total_uncompressed += info.file_size
                if total_uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES:
                    _reject("ZIP_UNCOMPRESSED_SIZE_EXCEEDED")
                body = archive.read(info)
                items.append(
                    ZipItem(
                        path=safe_path,
                        size_bytes=info.file_size,
                        compressed_size_bytes=info.compress_size,
                        sha256=sha256(body).hexdigest(),
                    )
                )
            return items
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
    payload = await file.read()
    items = inspect_zip_payload(payload)
    return ZipInspectResponse(status="ready", item_count=len(items), items=items)
