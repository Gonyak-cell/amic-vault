from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

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
    if not is_hwp_binary(payload):
        return ExtractionResult.failed("hwp5", "HWP5_OLE_INVALID")

    with tempfile.TemporaryDirectory(prefix="amic-hwp5-") as tmp:
        source = Path(tmp) / "source.hwp"
        source.write_bytes(payload)
        try:
            completed = subprocess.run(
                [_hwp5txt_command(), str(source)],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
        except FileNotFoundError:
            return ExtractionResult.failed("hwp5", "HWP5TXT_UNAVAILABLE")
        except subprocess.TimeoutExpired:
            return ExtractionResult.failed("hwp5", "HWP5TXT_TIMEOUT")

    if completed.returncode != 0:
        return ExtractionResult.failed("hwp5", _failure_reason(completed.stderr, completed.stdout))

    text = _decode_output(completed.stdout)
    if text is None:
        return ExtractionResult.failed("hwp5", "HWP5_TEXT_DECODE_FAILED")
    body_text = text.strip()
    if not body_text:
        return ExtractionResult.failed("hwp5", "HWP5_TEXT_EMPTY")
    return ExtractionResult.ready("hwp5", body_text)
