"""Strict API-to-worker ingestion envelope; no endpoint or URL fields are representable."""

from datetime import datetime, timedelta, timezone
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

MAX_INGESTION_OBJECT_BYTES = 500 * 1024 * 1024
MAX_INGESTION_EXPIRY = timedelta(minutes=15)
INGESTION_JOB_VALIDATION_ERROR_CODE = "VALIDATION_FAILED"
INGESTION_STORAGE_ALIASES = ("primary",)
INGESTION_PARSER_PROFILES = ("extract", "ocr", "convert", "email", "zip")

_CANONICAL_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_CANONICAL_INSTANT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_URI_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*://", re.IGNORECASE)


def _canonical_instant(value: str) -> datetime:
    if not _CANONICAL_INSTANT.fullmatch(value):
        raise ValueError("invalid instant")
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def _safe_object_key(value: str) -> bool:
    return (
        "\x00" not in value
        and "\\" not in value
        and "%2f" not in value
        and "%2e" not in value
        and _URI_SCHEME.match(value) is None
        and all(segment not in {".", ".."} for segment in value.split("/"))
    )


def _safe_object_version(value: str) -> bool:
    return "\x00" not in value and _URI_SCHEME.match(value) is None


class IngestionJobEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    tenantId: str = Field(pattern=_CANONICAL_UUID.pattern)
    documentId: str = Field(pattern=_CANONICAL_UUID.pattern)
    versionId: str = Field(pattern=_CANONICAL_UUID.pattern)
    fileObjectId: str = Field(pattern=_CANONICAL_UUID.pattern)
    storageAlias: str
    objectKey: str = Field(min_length=1, max_length=1024)
    objectVersion: str = Field(min_length=1, max_length=512)
    sha256: str = Field(pattern=_SHA256.pattern)
    sizeBytes: int = Field(ge=1, le=MAX_INGESTION_OBJECT_BYTES)
    parserProfile: str
    requestId: str = Field(pattern=_CANONICAL_UUID.pattern)
    expiresAt: str = Field(pattern=_CANONICAL_INSTANT.pattern)

    @field_validator("storageAlias")
    @classmethod
    def storage_alias_is_closed(cls, value: str) -> str:
        if value not in INGESTION_STORAGE_ALIASES:
            raise ValueError("unknown storage alias")
        return value

    @field_validator("parserProfile")
    @classmethod
    def parser_profile_is_closed(cls, value: str) -> str:
        if value not in INGESTION_PARSER_PROFILES:
            raise ValueError("unknown parser profile")
        return value

    @field_validator("objectKey")
    @classmethod
    def object_key_is_safe(cls, value: str) -> str:
        if not _safe_object_key(value):
            raise ValueError("unsafe object key")
        return value

    @field_validator("objectVersion")
    @classmethod
    def object_version_is_safe(cls, value: str) -> str:
        if not _safe_object_version(value):
            raise ValueError("unsafe object version")
        return value

    @model_validator(mode="after")
    def expiry_is_bounded(self, info) -> "IngestionJobEnvelope":
        expires_at = _canonical_instant(self.expiresAt)
        now = info.context.get("now") if info.context else None
        if now is None:
            now = datetime.now(timezone.utc)
        if now.tzinfo is None:
            raise ValueError("invalid validation clock")
        normalized_now = now.astimezone(timezone.utc)
        if expires_at <= normalized_now or expires_at > normalized_now + MAX_INGESTION_EXPIRY:
            raise ValueError("expiry outside allowed window")
        return self


def validate_ingestion_job(
    value: Any,
    *,
    now: datetime | None = None,
) -> tuple[IngestionJobEnvelope | None, str | None]:
    """Return the contract model or its only externally usable validation code."""
    try:
        return IngestionJobEnvelope.model_validate(value, context={"now": now} if now else None), None
    except ValidationError:
        return None, INGESTION_JOB_VALIDATION_ERROR_CODE
