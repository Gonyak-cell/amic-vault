from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.runtime_secret import (
    RuntimeSecretDenied,
    read_runtime_file,
    runtime_secret_value,
)


def _secret(root: Path, name: str, value: str = "synthetic-production-value") -> Path:
    path = root / name
    path.write_text(f"{value}\n", encoding="utf-8")
    path.chmod(0o600)
    return path


def test_direct_development_and_file_only_production(tmp_path: Path) -> None:
    assert (
        runtime_secret_value(
            "INGESTION_STORAGE_ACCESS_KEY_ID",
            {"NODE_ENV": "test", "INGESTION_STORAGE_ACCESS_KEY_ID": "amic-vault-minio"},
        )
        == "amic-vault-minio"
    )
    path = _secret(tmp_path, "access", "synthetic-production-access")
    env = {
        "NODE_ENV": "production",
        "INGESTION_STORAGE_ACCESS_KEY_ID_FILE": str(path),
    }
    assert (
        runtime_secret_value(
            "INGESTION_STORAGE_ACCESS_KEY_ID",
            env,
            production_root=tmp_path,
            expected_uid=os.geteuid(),
        )
        == "synthetic-production-access"
    )
    assert "INGESTION_STORAGE_ACCESS_KEY_ID" not in env


def test_direct_value_missing_outside_and_symlink_fail_closed(tmp_path: Path) -> None:
    canary = "DO_NOT_ECHO_WORKER_SECRET_CANARY"
    with pytest.raises(RuntimeSecretDenied) as direct:
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {"NODE_ENV": "production", "INGESTION_STORAGE_SECRET_ACCESS_KEY": canary},
        )
    assert direct.value.code == "INGESTION_STORAGE_SECRET_ACCESS_KEY_DIRECT_ENV_FORBIDDEN"
    assert canary not in repr(direct.value)

    with pytest.raises(RuntimeSecretDenied, match="INGESTION_STORAGE_SECRET_ACCESS_KEY_REQUIRED"):
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {"NODE_ENV": "production"},
            production_root=tmp_path,
        )

    outside = _secret(tmp_path, "outside")
    with pytest.raises(RuntimeSecretDenied, match="INGESTION_STORAGE_SECRET_ACCESS_KEY_PATH_INVALID"):
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {
                "NODE_ENV": "production",
                "INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE": str(outside),
            },
            production_root=tmp_path / "nested",
        )

    target = _secret(tmp_path, "target")
    link = tmp_path / "link"
    link.symlink_to(target)
    with pytest.raises(RuntimeSecretDenied, match="INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE_INVALID"):
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {
                "NODE_ENV": "production",
                "INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE": str(link),
            },
            production_root=tmp_path,
        )

    with pytest.raises(RuntimeSecretDenied, match="INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE_INVALID"):
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {
                "NODE_ENV": "production",
                "INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE": str(tmp_path),
            },
            production_root=tmp_path.parent,
        )

    fifo = tmp_path / "fifo"
    os.mkfifo(fifo)
    with pytest.raises(RuntimeSecretDenied, match="INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE_INVALID"):
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {
                "NODE_ENV": "production",
                "INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE": str(fifo),
            },
            production_root=tmp_path,
        )


def test_mode_owner_size_nul_and_dev_default_fail_closed(tmp_path: Path) -> None:
    weak = _secret(tmp_path, "weak")
    weak.chmod(0o644)
    with pytest.raises(
        RuntimeSecretDenied,
        match="INGESTION_STORAGE_SECRET_ACCESS_KEY_PERMISSIONS_INVALID",
    ):
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {
                "NODE_ENV": "production",
                "INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE": str(weak),
            },
            production_root=tmp_path,
        )

    owned = _secret(tmp_path, "owned")
    with pytest.raises(RuntimeSecretDenied, match="INGESTION_STORAGE_SECRET_ACCESS_KEY_OWNER_INVALID"):
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {
                "NODE_ENV": "production",
                "INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE": str(owned),
            },
            production_root=tmp_path,
            expected_uid=os.geteuid() + 1000,
        )

    oversized = _secret(tmp_path, "oversized", "x" * 33)
    with pytest.raises(RuntimeSecretDenied, match="INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE_INVALID"):
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {
                "NODE_ENV": "production",
                "INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE": str(oversized),
            },
            production_root=tmp_path,
            maximum_bytes=32,
        )

    nul = _secret(tmp_path, "nul", "safe\x00unsafe")
    with pytest.raises(RuntimeSecretDenied, match="INGESTION_STORAGE_SECRET_ACCESS_KEY_VALUE_INVALID"):
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {
                "NODE_ENV": "production",
                "INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE": str(nul),
            },
            production_root=tmp_path,
        )

    development = _secret(tmp_path, "development", "amic-vault-minio-dev-password")
    with pytest.raises(RuntimeSecretDenied, match="INGESTION_STORAGE_SECRET_ACCESS_KEY_VALUE_INVALID"):
        runtime_secret_value(
            "INGESTION_STORAGE_SECRET_ACCESS_KEY",
            {
                "NODE_ENV": "production",
                "INGESTION_STORAGE_SECRET_ACCESS_KEY_FILE": str(development),
            },
            production_root=tmp_path,
        )


def test_public_certificate_may_be_world_readable_but_not_writable(tmp_path: Path) -> None:
    certificate = _secret(tmp_path, "public.crt", "synthetic-public-certificate")
    certificate.chmod(0o444)
    assert (
        read_runtime_file(
            "INGESTION_GATEWAY_CA_FILE",
            str(certificate),
            {"NODE_ENV": "production"},
            confidential=False,
            production_root=tmp_path,
        )
        == b"synthetic-public-certificate\n"
    )
