from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from io import BytesIO

import pytest
from botocore.exceptions import ClientError, ConnectTimeoutError

from app.contracts import IngestionJobEnvelope
from app.storage_client import (
    FixedProfileStorageClient,
    WorkerStorageAccessDenied,
    WorkerStorageNotFound,
    WorkerStorageProfile,
    WorkerStorageUnavailable,
)


TENANT_ID = "11111111-1111-4111-8111-111111111111"
MATTER_ID = "11111111-1111-4111-8111-111111111122"
DOCUMENT_ID = "11111111-1111-4111-8111-111111111133"
FILE_OBJECT_ID = "11111111-1111-4111-8111-111111111144"
VERSION_ID = "11111111-1111-4111-8111-111111111155"
RAW_VERSION = "provider-version-1"
PAYLOAD = b"immutable fixture bytes"
OBJECT_KEY = f"tenants/{TENANT_ID}/matters/{MATTER_ID}/documents/{DOCUMENT_ID}/{FILE_OBJECT_ID}"


def _job(**overrides: object) -> IngestionJobEnvelope:
    return IngestionJobEnvelope.model_validate(
        {
            "tenantId": TENANT_ID,
            "documentId": DOCUMENT_ID,
            "versionId": VERSION_ID,
            "fileObjectId": FILE_OBJECT_ID,
            "storageAlias": "primary",
            "objectKey": OBJECT_KEY,
            "objectVersion": sha256(RAW_VERSION.encode()).hexdigest(),
            "sha256": sha256(PAYLOAD).hexdigest(),
            "sizeBytes": len(PAYLOAD),
            "parserProfile": "extract",
            "requestId": "11111111-1111-4111-8111-111111111166",
            "expiresAt": "2030-01-01T00:05:00Z",
            **overrides,
        },
        context={"now": datetime(2030, 1, 1, tzinfo=timezone.utc)},
    )


def _profile(**overrides: str) -> WorkerStorageProfile:
    return WorkerStorageProfile(
        endpoint="http://minio.internal:9000",
        bucket="amic-vault-documents",
        region="us-east-1",
        access_key_id="rotated-access-key",
        secret_access_key="rotated-secret",
        **overrides,
    )


class FakeS3:
    def __init__(self, *, status: int | None = None, payload: bytes = PAYLOAD, version: str = RAW_VERSION) -> None:
        self.status = status
        self.payload = payload
        self.version = version
        self.calls: list[dict[str, object]] = []

    def list_object_versions(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(kwargs)
        if self.status:
            raise ClientError({"ResponseMetadata": {"HTTPStatusCode": self.status}}, "ListObjectVersions")
        return {"Versions": [{"Key": OBJECT_KEY, "VersionId": self.version}]}

    def get_object(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(kwargs)
        if self.status:
            raise ClientError({"ResponseMetadata": {"HTTPStatusCode": self.status}}, "GetObject")
        return {
            "Body": BytesIO(self.payload),
            "ContentLength": len(self.payload),
            "ContentType": "application/pdf",
        }


def test_reads_only_the_exact_version_bound_to_the_envelope() -> None:
    client = FixedProfileStorageClient(_profile(), FakeS3())

    stored = client.read(_job())

    assert stored.body == PAYLOAD
    assert stored.content_type == "application/pdf"
    assert client._client.calls == [
        {"Bucket": "amic-vault-documents", "Prefix": OBJECT_KEY, "MaxKeys": 2},
        {"Bucket": "amic-vault-documents", "Key": OBJECT_KEY, "VersionId": RAW_VERSION},
    ]


@pytest.mark.parametrize(
    "overrides",
    [
        {"storageAlias": "other"},
        {"objectKey": f"tenants/22222222-2222-4222-8222-222222222222/matters/{MATTER_ID}/documents/{DOCUMENT_ID}/{FILE_OBJECT_ID}"},
        {"objectKey": f"tenants/{TENANT_ID}/matters/{MATTER_ID}/documents/{DOCUMENT_ID}/../{FILE_OBJECT_ID}"},
    ],
)
def test_rejects_noncanonical_alias_tenant_or_traversal_before_storage_access(overrides: dict[str, str]) -> None:
    client = FixedProfileStorageClient(_profile(), FakeS3())
    with pytest.raises(WorkerStorageAccessDenied):
        client.read(_job().model_copy(update=overrides))
    assert client._client.calls == []


def test_rejects_unknown_version_and_hash_or_size_mismatch() -> None:
    with pytest.raises(WorkerStorageNotFound):
        FixedProfileStorageClient(_profile(), FakeS3(version="other-provider-version")).read(_job())
    with pytest.raises(WorkerStorageAccessDenied):
        FixedProfileStorageClient(_profile(), FakeS3(payload=b"substituted")).read(_job())
    with pytest.raises(WorkerStorageAccessDenied):
        FixedProfileStorageClient(_profile(), FakeS3()).read(_job(sizeBytes=len(PAYLOAD) + 1))


@pytest.mark.parametrize(
    "status,error",
    [(403, WorkerStorageAccessDenied), (404, WorkerStorageNotFound), (500, WorkerStorageUnavailable)],
)
def test_maps_storage_service_errors_without_exposing_details(status: int, error: type[Exception]) -> None:
    with pytest.raises(error):
        FixedProfileStorageClient(_profile(), FakeS3(status=status)).read(_job())


def test_rejects_invalid_fixed_profile_endpoint_and_accepts_rotated_boot_credentials() -> None:
    env = {
        "INGESTION_STORAGE_ENDPOINT": "https://minio.internal:9000",
        "INGESTION_STORAGE_BUCKET": "amic-vault-documents",
        "INGESTION_STORAGE_REGION": "us-east-1",
        "INGESTION_STORAGE_ACCESS_KEY_ID": "new-access-key",
        "INGESTION_STORAGE_SECRET_ACCESS_KEY": "new-secret",
    }
    assert WorkerStorageProfile.from_env(env).access_key_id == "new-access-key"
    with pytest.raises(WorkerStorageUnavailable):
        WorkerStorageProfile.from_env(
            {**env, "INGESTION_STORAGE_ENDPOINT": "https://minio.internal:9000/?endpoint=https://attacker.invalid"}
        )


def test_maps_timeout_to_unavailable() -> None:
    class TimeoutS3(FakeS3):
        def list_object_versions(self, **kwargs: object) -> dict[str, object]:
            raise ConnectTimeoutError(endpoint_url="http://minio.internal:9000")

    with pytest.raises(WorkerStorageUnavailable):
        FixedProfileStorageClient(_profile(), TimeoutS3()).read(_job())
