from __future__ import annotations

import os
import tempfile
from pathlib import Path

from app.resource_policy import (
    ParserLimitExceeded,
    ParserSubprocessFailed,
    assert_input_bytes,
    assert_output_text,
    assert_wall_time,
    parser_profile,
    run_bounded_subprocess,
    start_wall_clock,
)

from .types import ExtractionResult

hwp5_signature = b"\xd0\xcf\x11\xe0"


def is_hwp_binary(payload: bytes) -> bool:
    return payload.startswith(hwp5_signature)


def _hwp5txt_command() -> str:
    return os.environ.get("HWP5TXT_BIN", "hwp5txt")


def _decode_output(payload: bytes) -> str | None:
    for encoding in ("utf-8", "cp949"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return None


def _failure_reason(stderr: bytes, stdout: bytes) -> str:
    message = " ".join(
        text
        for payload in (stderr, stdout)
        if (text := (_decode_output(payload) or "").strip())
    ).lower()
    if any(marker in message for marker in ("password", "encrypted", "drm", "distribution")):
        return "HWP_ENCRYPTED_OR_DRM"
    return "HWP5_TEXT_EXTRACTION_FAILED"


def extract_hwp_binary(payload: bytes) -> ExtractionResult:
    profile = parser_profile("extract")
    started_at = start_wall_clock()
    try:
        assert_input_bytes(profile, len(payload))
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("hwp5", exc.reason_code)
    if not is_hwp_binary(payload):
        return ExtractionResult.failed("hwp5", "HWP5_OLE_INVALID")

    with tempfile.TemporaryDirectory(prefix="amic-hwp5-") as tmp:
        source = Path(tmp) / "source.hwp"
        source.write_bytes(payload)
        try:
            completed = run_bounded_subprocess(
                [_hwp5txt_command(), str(source)],
                profile_name="extract",
                cwd=tmp,
                check=False,
                timeout_seconds=30,
            )
        except ParserSubprocessFailed as exc:
            if exc.reason_code == "PARSER_SUBPROCESS_UNAVAILABLE":
                return ExtractionResult.failed("hwp5", "HWP5TXT_UNAVAILABLE")
            if exc.reason_code == "PARSER_SUBPROCESS_TIMEOUT":
                return ExtractionResult.failed("hwp5", "HWP5TXT_TIMEOUT")
            if exc.reason_code == "PARSER_SUBPROCESS_OUTPUT_LIMIT_EXCEEDED":
                return ExtractionResult.failed("hwp5", "HWP5TXT_OUTPUT_LIMIT_EXCEEDED")
            return ExtractionResult.failed("hwp5", "HWP5_TEXT_EXTRACTION_FAILED")

    if completed.returncode != 0:
        return ExtractionResult.failed("hwp5", _failure_reason(completed.stderr, completed.stdout))

    text = _decode_output(completed.stdout)
    if text is None:
        return ExtractionResult.failed("hwp5", "HWP5_TEXT_DECODE_FAILED")
    body_text = text.strip()
    if not body_text:
        return ExtractionResult.failed("hwp5", "HWP5_TEXT_EMPTY")
    try:
        assert_output_text(profile, body_text)
        assert_wall_time(profile, started_at)
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("hwp5", exc.reason_code)
    return ExtractionResult.ready("hwp5", body_text)
