"""Fixed-profile, read-only S3 access for a validated ingestion envelope."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import os
import re
from typing import Any, Mapping, Protocol
from urllib.parse import urlsplit

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError, ConnectTimeoutError, ReadTimeoutError

from .contracts import IngestionJobEnvelope, MAX_INGESTION_OBJECT_BYTES


class WorkerStorageError(RuntimeError):
    code = "VALIDATION_FAILED"


class WorkerStorageAccessDenied(WorkerStorageError):
    code = "PERMISSION_DENIED"


class WorkerStorageNotFound(WorkerStorageError):
    code = "VALIDATION_FAILED"


class WorkerStorageUnavailable(WorkerStorageError):
    code = "VALIDATION_FAILED"


_BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")


@dataclass(frozen=True)
class WorkerStorageProfile:
    endpoint: str
    bucket: str
    region: str
    access_key_id: str
    secret_access_key: str
    storage_alias: str = "primary"

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> "WorkerStorageProfile":
        values = {
            "endpoint": env.get("INGESTION_STORAGE_ENDPOINT", ""),
            "bucket": env.get("INGESTION_STORAGE_BUCKET", ""),
            "region": env.get("INGESTION_STORAGE_REGION", ""),
            "access_key_id": env.get("INGESTION_STORAGE_ACCESS_KEY_ID", ""),
            "secret_access_key": env.get("INGESTION_STORAGE_SECRET_ACCESS_KEY", ""),
            "storage_alias": env.get("INGESTION_STORAGE_ALIAS", "primary"),
        }
        endpoint = urlsplit(values["endpoint"])
        if (
            endpoint.scheme not in {"https", "http"}
            or not endpoint.netloc
            or endpoint.username is not None
            or endpoint.password is not None
            or endpoint.path not in {"", "/"}
            or endpoint.query
            or endpoint.fragment
            or not _BUCKET.fullmatch(values["bucket"])
            or not values["region"]
            or not values["access_key_id"]
            or not values["secret_access_key"]
            or values["storage_alias"] != "primary"
        ):
            raise WorkerStorageUnavailable()
        return cls(**values)


@dataclass(frozen=True)
class WorkerStoredObject:
    body: bytes
    content_type: str | None


class S3Client(Protocol):
    def list_object_versions(self, **kwargs: Any) -> Mapping[str, Any]: ...

    def get_object(self, **kwargs: Any) -> Mapping[str, Any]: ...


def _assert_document_key(job: IngestionJobEnvelope) -> None:
    parts = job.objectKey.split("/")
    if (
        len(parts) != 7
        or parts[0] != "tenants"
        or parts[1] != job.tenantId
        or parts[2] != "matters"
        or parts[4] != "documents"
        or parts[5] != job.documentId
        or parts[6] != job.fileObjectId
    ):
        raise WorkerStorageAccessDenied()


class FixedProfileStorageClient:
    def __init__(self, profile: WorkerStorageProfile, client: S3Client | None = None) -> None:
        self._profile = profile
        self._client = client or boto3.client(
            "s3",
            endpoint_url=profile.endpoint,
            region_name=profile.region,
            aws_access_key_id=profile.access_key_id,
            aws_secret_access_key=profile.secret_access_key,
            config=Config(connect_timeout=5, read_timeout=10, retries={"max_attempts": 2, "mode": "standard"}),
        )

    def read(self, job: IngestionJobEnvelope) -> WorkerStoredObject:
        if job.storageAlias != self._profile.storage_alias:
            raise WorkerStorageAccessDenied()
        _assert_document_key(job)
        try:
            inventory = self._client.list_object_versions(
                Bucket=self._profile.bucket,
                Prefix=job.objectKey,
                MaxKeys=2,
            )
            if inventory.get("IsTruncated"):
                raise WorkerStorageUnavailable()
            matches = [
                entry
                for entry in inventory.get("Versions", [])
                if entry.get("Key") == job.objectKey
                and isinstance(entry.get("VersionId"), str)
                and sha256(entry["VersionId"].encode("utf-8")).hexdigest() == job.objectVersion
            ]
            if len(matches) != 1:
                raise WorkerStorageNotFound()
            version_id = matches[0]["VersionId"]
            response = self._client.get_object(
                Bucket=self._profile.bucket,
                Key=job.objectKey,
                VersionId=version_id,
            )
            content_length = response.get("ContentLength")
            if content_length != job.sizeBytes:
                raise WorkerStorageAccessDenied()
            stream = response.get("Body")
            if stream is None or not hasattr(stream, "read"):
                raise WorkerStorageUnavailable()
            digest = sha256()
            chunks: list[bytes] = []
            total = 0
            while True:
                chunk = stream.read(64 * 1024)
                if not chunk:
                    break
                if not isinstance(chunk, bytes):
                    raise WorkerStorageUnavailable()
                total += len(chunk)
                if total > job.sizeBytes or total > MAX_INGESTION_OBJECT_BYTES:
                    raise WorkerStorageAccessDenied()
                digest.update(chunk)
                chunks.append(chunk)
            if total != job.sizeBytes or digest.hexdigest() != job.sha256:
                raise WorkerStorageAccessDenied()
            content_type = response.get("ContentType")
            return WorkerStoredObject(b"".join(chunks), content_type if isinstance(content_type, str) else None)
        except (WorkerStorageError,):
            raise
        except ClientError as exc:
            status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status == 403:
                raise WorkerStorageAccessDenied() from exc
            if status == 404:
                raise WorkerStorageNotFound() from exc
            raise WorkerStorageUnavailable() from exc
        except (ConnectTimeoutError, ReadTimeoutError, BotoCoreError, OSError) as exc:
            raise WorkerStorageUnavailable() from exc


_storage_client: FixedProfileStorageClient | None = None


def read_ingestion_object(job: IngestionJobEnvelope) -> WorkerStoredObject:
    global _storage_client
    if _storage_client is None:
        _storage_client = FixedProfileStorageClient(WorkerStorageProfile.from_env())
    return _storage_client.read(job)
