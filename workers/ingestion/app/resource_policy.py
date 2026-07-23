"""Central, dependency-free resource limits for hostile document parsing."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import PurePosixPath
import signal
import subprocess
import tempfile
import time
from collections.abc import Iterable, Mapping, Sequence
from typing import Protocol, TypeVar


class ArchiveMember(Protocol):
    filename: str
    file_size: int
    compress_size: int
    flag_bits: int

    def is_dir(self) -> bool: ...


@dataclass(frozen=True)
class ParserResourceProfile:
    name: str
    wall_seconds: int
    subprocess_seconds: int
    max_input_bytes: int
    max_pages: int
    max_archive_members: int
    max_archive_depth: int
    max_expanded_bytes: int
    max_compression_ratio: int
    max_output_text_chars: int
    max_output_bytes: int
    max_subprocess_output_bytes: int
    max_fallbacks: int


class ParserLimitExceeded(RuntimeError):
    """Closed parser failure carrying only an enumerable reason code."""

    def __init__(self, reason_code: str) -> None:
        self.reason_code = reason_code
        super().__init__(reason_code)


class ParserSubprocessFailed(RuntimeError):
    """Bounded subprocess failure; stdout/stderr are intentionally omitted."""

    def __init__(self, reason_code: str, returncode: int | None = None) -> None:
        self.reason_code = reason_code
        self.returncode = returncode
        super().__init__(reason_code)


_MIB = 1024 * 1024

_PROFILES: Mapping[str, ParserResourceProfile] = {
    "extract": ParserResourceProfile(
        name="extract",
        wall_seconds=45,
        subprocess_seconds=30,
        max_input_bytes=500 * _MIB,
        max_pages=500,
        max_archive_members=2_000,
        max_archive_depth=8,
        max_expanded_bytes=512 * _MIB,
        max_compression_ratio=100,
        max_output_text_chars=8_000_000,
        max_output_bytes=128 * _MIB,
        max_subprocess_output_bytes=1 * _MIB,
        max_fallbacks=2,
    ),
    "ocr": ParserResourceProfile(
        name="ocr",
        wall_seconds=180,
        subprocess_seconds=120,
        max_input_bytes=128 * _MIB,
        max_pages=200,
        max_archive_members=0,
        max_archive_depth=0,
        max_expanded_bytes=0,
        max_compression_ratio=0,
        max_output_text_chars=4_000_000,
        max_output_bytes=256 * _MIB,
        max_subprocess_output_bytes=4 * _MIB,
        max_fallbacks=1,
    ),
    "convert": ParserResourceProfile(
        name="convert",
        wall_seconds=60,
        subprocess_seconds=45,
        max_input_bytes=500 * _MIB,
        max_pages=500,
        max_archive_members=2_000,
        max_archive_depth=8,
        max_expanded_bytes=512 * _MIB,
        max_compression_ratio=100,
        max_output_text_chars=0,
        max_output_bytes=256 * _MIB,
        max_subprocess_output_bytes=1 * _MIB,
        max_fallbacks=1,
    ),
    "email": ParserResourceProfile(
        name="email",
        wall_seconds=30,
        subprocess_seconds=15,
        max_input_bytes=128 * _MIB,
        max_pages=0,
        max_archive_members=1_000,
        max_archive_depth=8,
        max_expanded_bytes=256 * _MIB,
        max_compression_ratio=100,
        max_output_text_chars=1_000_000,
        max_output_bytes=64 * _MIB,
        max_subprocess_output_bytes=1 * _MIB,
        max_fallbacks=2,
    ),
    "zip": ParserResourceProfile(
        name="zip",
        wall_seconds=30,
        subprocess_seconds=15,
        max_input_bytes=500 * _MIB,
        max_pages=0,
        max_archive_members=5_000,
        max_archive_depth=8,
        max_expanded_bytes=512 * _MIB,
        max_compression_ratio=100,
        max_output_text_chars=0,
        max_output_bytes=512 * _MIB,
        max_subprocess_output_bytes=1 * _MIB,
        max_fallbacks=0,
    ),
}


def parser_profile(name: str) -> ParserResourceProfile:
    profile = _PROFILES.get(name)
    if profile is None:
        raise ParserLimitExceeded("PARSER_PROFILE_INVALID")
    return profile


def policy_manifest() -> dict[str, dict[str, int | str]]:
    return {
        name: {
            field: getattr(profile, field)
            for field in ParserResourceProfile.__dataclass_fields__
        }
        for name, profile in _PROFILES.items()
    }


def assert_input_bytes(profile: ParserResourceProfile, size: int) -> None:
    if not isinstance(size, int) or isinstance(size, bool) or size < 0:
        raise ParserLimitExceeded("PARSER_INPUT_INVALID")
    if size > profile.max_input_bytes:
        raise ParserLimitExceeded("PARSER_INPUT_LIMIT_EXCEEDED")


def assert_page_count(profile: ParserResourceProfile, count: int) -> None:
    if not isinstance(count, int) or isinstance(count, bool) or count < 0:
        raise ParserLimitExceeded("PARSER_PAGE_COUNT_INVALID")
    if profile.max_pages < 1 or count > profile.max_pages:
        raise ParserLimitExceeded("PARSER_PAGE_LIMIT_EXCEEDED")


def assert_output_text(profile: ParserResourceProfile, text: str) -> None:
    if not isinstance(text, str):
        raise ParserLimitExceeded("PARSER_OUTPUT_INVALID")
    if profile.max_output_text_chars < 1 or len(text) > profile.max_output_text_chars:
        raise ParserLimitExceeded("PARSER_TEXT_LIMIT_EXCEEDED")


def assert_output_bytes(profile: ParserResourceProfile, payload: bytes) -> None:
    if not isinstance(payload, bytes):
        raise ParserLimitExceeded("PARSER_OUTPUT_INVALID")
    if profile.max_output_bytes < 1 or len(payload) > profile.max_output_bytes:
        raise ParserLimitExceeded("PARSER_OUTPUT_LIMIT_EXCEEDED")


def assert_fallback_count(profile: ParserResourceProfile, count: int) -> None:
    if not isinstance(count, int) or isinstance(count, bool) or count < 0:
        raise ParserLimitExceeded("PARSER_FALLBACK_INVALID")
    if count > profile.max_fallbacks:
        raise ParserLimitExceeded("PARSER_FALLBACK_LIMIT_EXCEEDED")


def start_wall_clock() -> float:
    return time.monotonic()


def assert_wall_time(profile: ParserResourceProfile, started_at: float) -> None:
    elapsed = time.monotonic() - started_at
    if elapsed < 0 or elapsed > profile.wall_seconds:
        raise ParserLimitExceeded("PARSER_WALL_TIME_EXCEEDED")


def _safe_archive_path(value: str) -> str:
    normalized = value.replace("\\", "/")
    path = PurePosixPath(normalized)
    if (
        not normalized
        or "\x00" in normalized
        or path.is_absolute()
        or any(part in {"", ".", ".."} for part in path.parts)
    ):
        raise ParserLimitExceeded("ZIP_PATH_TRAVERSAL")
    return path.as_posix()


TArchiveMember = TypeVar("TArchiveMember", bound=ArchiveMember)


def validate_archive_members(
    profile: ParserResourceProfile,
    members: Iterable[TArchiveMember],
) -> list[tuple[TArchiveMember, str]]:
    if profile.max_archive_members < 1:
        raise ParserLimitExceeded("ARCHIVE_NOT_ALLOWED")
    accepted: list[tuple[TArchiveMember, str]] = []
    seen: set[str] = set()
    expanded = 0
    for member in members:
        if member.is_dir():
            continue
        if len(accepted) >= profile.max_archive_members:
            raise ParserLimitExceeded("ZIP_ITEM_COUNT_EXCEEDED")
        safe_path = _safe_archive_path(member.filename)
        key = safe_path.casefold()
        if key in seen:
            raise ParserLimitExceeded("ZIP_DUPLICATE_PATH")
        seen.add(key)
        if len(PurePosixPath(safe_path).parts) > profile.max_archive_depth:
            raise ParserLimitExceeded("ZIP_DEPTH_EXCEEDED")
        if member.flag_bits & 0x1:
            raise ParserLimitExceeded("ZIP_ENCRYPTED_ENTRY")
        if member.file_size < 0 or member.compress_size < 0:
            raise ParserLimitExceeded("ZIP_MEMBER_SIZE_INVALID")
        if member.file_size > 0 and member.compress_size == 0:
            raise ParserLimitExceeded("ZIP_COMPRESSION_RATIO_EXCEEDED")
        if (
            member.compress_size > 0
            and member.file_size / member.compress_size > profile.max_compression_ratio
        ):
            raise ParserLimitExceeded("ZIP_COMPRESSION_RATIO_EXCEEDED")
        expanded += member.file_size
        if expanded > profile.max_expanded_bytes:
            raise ParserLimitExceeded("ZIP_UNCOMPRESSED_SIZE_EXCEEDED")
        accepted.append((member, safe_path))
    return accepted


def _terminate_process_group(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    try:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
    except (LookupError, OSError):
        process.kill()
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=2)


def run_bounded_subprocess(
    command: Sequence[str],
    *,
    profile_name: str,
    timeout_seconds: int | None = None,
    cwd: str | os.PathLike[str] | None = None,
    env: Mapping[str, str] | None = None,
    check: bool = False,
) -> subprocess.CompletedProcess[bytes]:
    profile = parser_profile(profile_name)
    if (
        not command
        or len(command) > 64
        or any(not isinstance(item, str) or not item or "\x00" in item for item in command)
    ):
        raise ParserSubprocessFailed("PARSER_SUBPROCESS_COMMAND_INVALID")
    requested_timeout = timeout_seconds if timeout_seconds is not None else profile.subprocess_seconds
    if (
        not isinstance(requested_timeout, int)
        or isinstance(requested_timeout, bool)
        or requested_timeout < 1
    ):
        raise ParserSubprocessFailed("PARSER_SUBPROCESS_TIMEOUT_INVALID")
    effective_timeout = min(requested_timeout, profile.subprocess_seconds)

    with tempfile.TemporaryFile(prefix="amic-parser-stdout-") as stdout_file:
        with tempfile.TemporaryFile(prefix="amic-parser-stderr-") as stderr_file:
            try:
                process = subprocess.Popen(
                    list(command),
                    cwd=cwd,
                    env=dict(env) if env is not None else None,
                    stdin=subprocess.DEVNULL,
                    stdout=stdout_file,
                    stderr=stderr_file,
                    start_new_session=True,
                )
            except (OSError, ValueError) as exc:
                raise ParserSubprocessFailed("PARSER_SUBPROCESS_UNAVAILABLE") from exc

            try:
                deadline = time.monotonic() + effective_timeout
                while process.poll() is None:
                    if time.monotonic() >= deadline:
                        _terminate_process_group(process)
                        raise ParserSubprocessFailed("PARSER_SUBPROCESS_TIMEOUT")
                    output_size = os.fstat(stdout_file.fileno()).st_size + os.fstat(
                        stderr_file.fileno()
                    ).st_size
                    if output_size > profile.max_subprocess_output_bytes:
                        _terminate_process_group(process)
                        raise ParserSubprocessFailed(
                            "PARSER_SUBPROCESS_OUTPUT_LIMIT_EXCEEDED"
                        )
                    time.sleep(0.01)

                output_size = os.fstat(stdout_file.fileno()).st_size + os.fstat(
                    stderr_file.fileno()
                ).st_size
                if output_size > profile.max_subprocess_output_bytes:
                    raise ParserSubprocessFailed(
                        "PARSER_SUBPROCESS_OUTPUT_LIMIT_EXCEEDED",
                        process.returncode,
                    )
                stdout_file.seek(0)
                stderr_file.seek(0)
                completed = subprocess.CompletedProcess(
                    list(command),
                    process.returncode,
                    stdout_file.read(profile.max_subprocess_output_bytes + 1),
                    stderr_file.read(profile.max_subprocess_output_bytes + 1),
                )
                if check and completed.returncode != 0:
                    raise ParserSubprocessFailed(
                        "PARSER_SUBPROCESS_FAILED",
                        completed.returncode,
                    )
                return completed
            except BaseException:
                _terminate_process_group(process)
                raise
