from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile

from .parsers.email import parse_eml_envelope, parse_msg_skeleton

EMAIL_PARSER_VERSION = "email-worker-v1"

router = APIRouter()


def _safe_filename(filename: str | None) -> str:
    return (filename or "message.eml").rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()


@router.post("/email/parse")
async def parse_email(
    tenant_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> dict[str, object]:
    if not x_amic_tenant_id or x_amic_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})

    filename = _safe_filename(file.filename)
    if filename.endswith(".msg"):
        result = parse_msg_skeleton(await file.read())
    elif filename.endswith(".eml"):
        result = parse_eml_envelope(await file.read())
    else:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})

    payload = asdict(result)
    payload["parser_version"] = EMAIL_PARSER_VERSION
    payload["parse_status"] = payload.pop("status")
    return payload
