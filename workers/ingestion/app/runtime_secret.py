"""Bounded file-only production runtime secret reader."""

from __future__ import annotations

import os
from pathlib import Path
import stat
from typing import Mapping


class RuntimeSecretDenied(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


PRODUCTION_SECRET_ROOT = Path("/run/secrets")
_DEVELOPMENT_VALUES = {
    "amic-vault-minio",
    "amic-vault-minio-dev-password",
    "amic_vault_dev_password",
    "vault_app_dev_password",
    "changeme",
    "development",
    "example",
}


def _fail(name: str, suffix: str) -> None:
    raise RuntimeSecretDenied(f"{name}_{suffix}")


def _inside(root: Path, path: Path) -> bool:
    try:
        resolved_root = root.resolve(strict=False)
        resolved_path = path.resolve(strict=False)
        return resolved_path != resolved_root and resolved_path.parent == resolved_root
    except (OSError, RuntimeError):
        return False


def read_runtime_file(
    name: str,
    path_value: str | None,
    env: Mapping[str, str] = os.environ,
    *,
    confidential: bool = True,
    maximum_bytes: int = 16 * 1024,
    production_root: Path = PRODUCTION_SECRET_ROOT,
    expected_uid: int | None = None,
) -> bytes:
    production = env.get("NODE_ENV") == "production"
    if not path_value:
        _fail(name, "REQUIRED")
    if "\x00" in path_value:
        _fail(name, "PATH_INVALID")
    path = Path(path_value)
    if not path.is_absolute() or (production and not _inside(production_root, path)):
        _fail(name, "PATH_INVALID")
    if not isinstance(maximum_bytes, int) or maximum_bytes < 1 or maximum_bytes > 1024 * 1024:
        _fail(name, "POLICY_INVALID")

    descriptor: int | None = None
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_size < 1
            or metadata.st_size > maximum_bytes
        ):
            _fail(name, "FILE_INVALID")
        if production:
            allowed_uid = os.geteuid() if expected_uid is None else expected_uid
            if metadata.st_uid not in {0, allowed_uid}:
                _fail(name, "OWNER_INVALID")
            permissions = stat.S_IMODE(metadata.st_mode)
            if confidential:
                if permissions & 0o077 or not permissions & 0o400:
                    _fail(name, "PERMISSIONS_INVALID")
            elif permissions & 0o022 or permissions & 0o444 != 0o444:
                _fail(name, "PERMISSIONS_INVALID")
        return os.read(descriptor, maximum_bytes + 1)
    except RuntimeSecretDenied:
        raise
    except OSError as exc:
        raise RuntimeSecretDenied(f"{name}_FILE_INVALID") from exc
    finally:
        if descriptor is not None:
            os.close(descriptor)


def runtime_secret_value(
    name: str,
    env: Mapping[str, str] = os.environ,
    *,
    maximum_bytes: int = 16 * 1024,
    production_root: Path = PRODUCTION_SECRET_ROOT,
    expected_uid: int | None = None,
) -> str:
    direct = env.get(name, "").strip()
    production = env.get("NODE_ENV") == "production"
    if production and direct:
        _fail(name, "DIRECT_ENV_FORBIDDEN")
    if not production and direct:
        value = direct
    else:
        value = read_runtime_file(
            name,
            env.get(f"{name}_FILE"),
            env,
            maximum_bytes=maximum_bytes,
            production_root=production_root,
            expected_uid=expected_uid,
        ).decode("utf-8").removesuffix("\n").removesuffix("\r")

    normalized = value.strip().lower()
    if (
        not value
        or "\x00" in value
        or (
            production
            and (
                normalized in _DEVELOPMENT_VALUES
                or "_dev_password" in normalized
                or "-dev-password" in normalized
            )
        )
    ):
        _fail(name, "VALUE_INVALID")
    return value
