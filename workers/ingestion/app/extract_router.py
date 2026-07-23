import asyncio
import os
from io import BytesIO
from zipfile import BadZipFile, ZipFile

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .contracts import IngestionJobEnvelope, validate_ingestion_job
from .parsers.clause_tree import ClauseTreeNode, extract_clause_tree
from .parsers.docx import extract_docx
from .parsers.docx_revisions import extract_docx_revisions
from .parsers.hwp_binary import extract_hwp_binary, is_hwp_binary
from .parsers.hwpx import extract_hwpx
from .parsers.office import extract_legacy_office, extract_pptx, extract_xlsx
from .parsers.pdf import extract_pdf
from .parsers.pdf_annotations import extract_pdf_annotations
from .parsers.plaintext import extract_csv, extract_html, extract_plaintext
from .parsers.types import ExtractionResult
from .service_identity import (
    InMemoryNonceReplayStore,
    ServiceIdentityDenied,
    verify_ingestion_request_identity,
)
from .storage_client import (
    WorkerStorageAccessDenied,
    WorkerStorageError,
    WorkerStorageNotFound,
    WorkerStoredObject,
    read_ingestion_object,
)

router = APIRouter()
_nonce_store = InMemoryNonceReplayStore()


class ExtractResponse(BaseModel):
    status: str
    extraction_method: str
    body_text: str = Field(default="")
    confidence: float
    failure_reason_code: str | None = None


class RevisionItem(BaseModel):
    change_type: str
    author: str | None = None
    date: str | None = None
    before_text: str = ""
    after_text: str = ""


class ExtractRevisionsResponse(BaseModel):
    status: str
    revisions: list[RevisionItem] = Field(default_factory=list)
    failure_reason_code: str | None = None


class AnnotationItem(BaseModel):
    annotation_type: str
    page: int
    author: str | None = None
    contents: str = ""
    rect: tuple[float, ...] = Field(default_factory=tuple)


class ExtractAnnotationsResponse(BaseModel):
    status: str
    annotations: list[AnnotationItem] = Field(default_factory=list)
    failure_reason_code: str | None = None


class ClauseTreeItem(BaseModel):
    clause_number: str
    title: str
    body: str
    start_offset: int
    end_offset: int
    level: int
    children: list["ClauseTreeItem"] = Field(default_factory=list)


class ExtractClauseTreeResponse(BaseModel):
    status: str
    clauses: list[ClauseTreeItem] = Field(default_factory=list)
    failure_reason_code: str | None = None


def _clause_tree_item(node: ClauseTreeNode) -> ClauseTreeItem:
    return ClauseTreeItem(
        clause_number=node.clause_number,
        title=node.title,
        body=node.body,
        start_offset=node.start_offset,
        end_offset=node.end_offset,
        level=node.level,
        children=[_clause_tree_item(child) for child in node.children],
    )


def _extension_from_stored_object(stored: WorkerStoredObject) -> str:
    content_type = (stored.content_type or "").split(";", 1)[0].strip().lower()
    known = {
        "application/pdf": "pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
        "application/msword": "doc",
        "application/vnd.ms-excel": "xls",
        "application/vnd.ms-powerpoint": "ppt",
        "application/x-hwp": "hwp",
        "application/vnd.hancom.hwp": "hwp",
        "application/haansofthwpx": "hwpx",
        "application/vnd.hancom.hwpx": "hwpx",
        "application/hwp+zip": "hwpx",
        "image/png": "png",
        "image/jpeg": "jpg",
        "text/plain": "txt",
        "text/markdown": "md",
        "text/csv": "csv",
        "text/html": "html",
    }
    if content_type in known:
        return known[content_type]
    if stored.body.startswith(b"%PDF"):
        return "pdf"
    if stored.body.startswith(b"\xd0\xcf\x11\xe0"):
        return "hwp" if is_hwp_binary(stored.body) else ""
    try:
        with ZipFile(BytesIO(stored.body)) as archive:
            entries = set(archive.namelist())
    except BadZipFile:
        return ""
    if "word/document.xml" in entries:
        return "docx"
    if "xl/workbook.xml" in entries:
        return "xlsx"
    if "ppt/presentation.xml" in entries:
        return "pptx"
    if any(name.startswith("Contents/section") for name in entries):
        return "hwpx"
    return ""


async def _read_validated_stored_object(request: Request, parser_profile: str) -> tuple[IngestionJobEnvelope, WorkerStoredObject]:
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED"}) from exc
    job, code = validate_ingestion_job(payload)
    if job is None or code is not None or job.parserProfile != parser_profile:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED"})
    identity = getattr(request.state, "ingestion_identity", None)
    if identity is None:
        try:
            identity = verify_ingestion_request_identity(
                request.headers,
                env=os.environ,
                nonce_store=_nonce_store,
            )
        except ServiceIdentityDenied as exc:
            raise HTTPException(status_code=403, detail={"code": "PERMISSION_DENIED"}) from exc
    if (
        identity.request_id != job.requestId
        or identity.expires_at.strftime("%Y-%m-%dT%H:%M:%SZ") != job.expiresAt
    ):
        raise HTTPException(status_code=403, detail={"code": "PERMISSION_DENIED"})
    try:
        reader = getattr(request.app.state, "ingestion_storage_reader", read_ingestion_object)
        return job, await asyncio.to_thread(reader, job)
    except WorkerStorageAccessDenied as exc:
        raise HTTPException(status_code=403, detail={"code": "PERMISSION_DENIED"}) from exc
    except WorkerStorageNotFound as exc:
        raise HTTPException(status_code=404, detail={"code": "VALIDATION_FAILED"}) from exc
    except WorkerStorageError as exc:
        raise HTTPException(status_code=503, detail={"code": "VALIDATION_FAILED"}) from exc


def _parse(ext: str, payload: bytes) -> ExtractionResult:
    if ext == "hwp":
        return extract_hwp_binary(payload)
    if ext == "hwpx" and is_hwp_binary(payload):
        return ExtractionResult.failed("failed", "UNSUPPORTED_HWP_BINARY")
    if ext == "pdf":
        return extract_pdf(payload)
    if ext == "docx":
        return extract_docx(payload)
    if ext == "hwpx":
        return extract_hwpx(payload)
    if ext == "txt":
        return extract_plaintext(payload, "text")
    if ext in {"md", "markdown"}:
        return extract_plaintext(payload, "markdown")
    if ext == "csv":
        return extract_csv(payload)
    if ext in {"html", "htm"}:
        return extract_html(payload)
    if ext == "xlsx":
        return extract_xlsx(payload)
    if ext == "pptx":
        return extract_pptx(payload)
    if ext in {"doc", "xls", "ppt"}:
        return extract_legacy_office(payload, ext)
    raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})


@router.post("/extract", response_model=ExtractResponse)
async def extract(request: Request) -> ExtractResponse:
    _, stored = await _read_validated_stored_object(request, "extract")
    result = _parse(_extension_from_stored_object(stored), stored.body)
    return ExtractResponse(
        status=result.status,
        extraction_method=result.extraction_method,
        body_text=result.body_text if result.status == "ready" else "",
        confidence=result.confidence,
        failure_reason_code=result.failure_reason_code,
    )


@router.post("/extract-revisions", response_model=ExtractRevisionsResponse)
async def extract_revisions(request: Request) -> ExtractRevisionsResponse:
    _, stored = await _read_validated_stored_object(request, "extract")
    if _extension_from_stored_object(stored) != "docx":
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})
    try:
        revisions = extract_docx_revisions(stored.body)
    except ValueError as exc:
        return ExtractRevisionsResponse(status="failed", failure_reason_code=str(exc))
    return ExtractRevisionsResponse(
        status="ready",
        revisions=[RevisionItem(**revision.__dict__) for revision in revisions],
    )


@router.post("/extract-annotations", response_model=ExtractAnnotationsResponse)
async def extract_annotations(request: Request) -> ExtractAnnotationsResponse:
    _, stored = await _read_validated_stored_object(request, "extract")
    if _extension_from_stored_object(stored) != "pdf":
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})
    try:
        annotations = extract_pdf_annotations(stored.body)
    except ValueError as exc:
        return ExtractAnnotationsResponse(status="failed", failure_reason_code=str(exc))
    return ExtractAnnotationsResponse(
        status="ready",
        annotations=[AnnotationItem(**annotation.__dict__) for annotation in annotations],
    )


@router.post("/extract-clause-tree", response_model=ExtractClauseTreeResponse)
async def extract_clause_tree_endpoint(request: Request) -> ExtractClauseTreeResponse:
    _, stored = await _read_validated_stored_object(request, "extract")
    result = _parse(_extension_from_stored_object(stored), stored.body)
    if result.status != "ready":
        return ExtractClauseTreeResponse(
            status="failed",
            failure_reason_code=result.failure_reason_code or "EXTRACTION_NOT_READY",
        )
    return ExtractClauseTreeResponse(
        status="ready",
        clauses=[_clause_tree_item(node) for node in extract_clause_tree(result.body_text)],
    )
