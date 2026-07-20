import asyncio
from typing import Annotated
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

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

router = APIRouter()


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


def _extension(filename: str) -> str:
    name = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()
    if "." not in name:
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})
    return name.rsplit(".", 1)[-1]


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


def _download_storage_url(storage_url: str) -> bytes:
    try:
        with urlopen(Request(storage_url, method="GET"), timeout=60) as response:
            return response.read()
    except (OSError, URLError) as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "STORAGE_URL_UNAVAILABLE"},
        ) from exc


async def _read_payload(
    file: UploadFile | None,
    storage_url: str | None,
    source_filename: str | None,
) -> tuple[str, bytes]:
    if (file is None) == (storage_url is None):
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED"})

    if storage_url is not None:
        filename = source_filename or storage_url
        payload = await asyncio.to_thread(_download_storage_url, storage_url)
    else:
        filename = file.filename or ""
        payload = await file.read()
    return filename, payload


@router.post("/extract", response_model=ExtractResponse)
async def extract(
    tenant_id: Annotated[str, Form()],
    version_id: Annotated[str, Form()],
    file: Annotated[UploadFile | None, File()] = None,
    storage_url: Annotated[str | None, Form()] = None,
    source_filename: Annotated[str | None, Form()] = None,
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> ExtractResponse:
    if not x_amic_tenant_id or x_amic_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})
    if not version_id:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED"})
    filename, payload = await _read_payload(file, storage_url, source_filename)
    result = _parse(_extension(filename), payload)
    return ExtractResponse(
        status=result.status,
        extraction_method=result.extraction_method,
        body_text=result.body_text if result.status == "ready" else "",
        confidence=result.confidence,
        failure_reason_code=result.failure_reason_code,
    )


@router.post("/extract-revisions", response_model=ExtractRevisionsResponse)
async def extract_revisions(
    tenant_id: Annotated[str, Form()],
    version_id: Annotated[str, Form()],
    file: Annotated[UploadFile | None, File()] = None,
    storage_url: Annotated[str | None, Form()] = None,
    source_filename: Annotated[str | None, Form()] = None,
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> ExtractRevisionsResponse:
    if not x_amic_tenant_id or x_amic_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})
    if not version_id:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED"})
    filename, payload = await _read_payload(file, storage_url, source_filename)
    if _extension(filename) != "docx":
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})
    try:
        revisions = extract_docx_revisions(payload)
    except ValueError as exc:
        return ExtractRevisionsResponse(status="failed", failure_reason_code=str(exc))
    return ExtractRevisionsResponse(
        status="ready",
        revisions=[RevisionItem(**revision.__dict__) for revision in revisions],
    )


@router.post("/extract-annotations", response_model=ExtractAnnotationsResponse)
async def extract_annotations(
    tenant_id: Annotated[str, Form()],
    version_id: Annotated[str, Form()],
    file: Annotated[UploadFile | None, File()] = None,
    storage_url: Annotated[str | None, Form()] = None,
    source_filename: Annotated[str | None, Form()] = None,
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> ExtractAnnotationsResponse:
    if not x_amic_tenant_id or x_amic_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})
    if not version_id:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED"})
    filename, payload = await _read_payload(file, storage_url, source_filename)
    if _extension(filename) != "pdf":
        raise HTTPException(status_code=415, detail={"code": "UNSUPPORTED_FILE_TYPE"})
    try:
        annotations = extract_pdf_annotations(payload)
    except ValueError as exc:
        return ExtractAnnotationsResponse(status="failed", failure_reason_code=str(exc))
    return ExtractAnnotationsResponse(
        status="ready",
        annotations=[AnnotationItem(**annotation.__dict__) for annotation in annotations],
    )


@router.post("/extract-clause-tree", response_model=ExtractClauseTreeResponse)
async def extract_clause_tree_endpoint(
    tenant_id: Annotated[str, Form()],
    version_id: Annotated[str, Form()],
    file: Annotated[UploadFile | None, File()] = None,
    storage_url: Annotated[str | None, Form()] = None,
    source_filename: Annotated[str | None, Form()] = None,
    x_amic_tenant_id: Annotated[str | None, Header(alias="x-amic-tenant-id")] = None,
) -> ExtractClauseTreeResponse:
    if not x_amic_tenant_id or x_amic_tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail={"code": "TENANT_ISOLATION_VIOLATION"})
    if not version_id:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED"})
    filename, payload = await _read_payload(file, storage_url, source_filename)
    result = _parse(_extension(filename), payload)
    if result.status != "ready":
        return ExtractClauseTreeResponse(
            status="failed",
            failure_reason_code=result.failure_reason_code or "EXTRACTION_NOT_READY",
        )
    return ExtractClauseTreeResponse(
        status="ready",
        clauses=[_clause_tree_item(node) for node in extract_clause_tree(result.body_text)],
    )
