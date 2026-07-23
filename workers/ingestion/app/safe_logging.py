"""Bounded JSON logging helpers shared by ingestion request middleware."""

from __future__ import annotations

from hashlib import sha256
import json
import re
import sys
from typing import TextIO

REDACTED = "[REDACTED]"

_SAFE_REFERENCE = re.compile(r"^ref:[a-f0-9]{16}$")
_RAW_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_BOUNDED_SCALAR = re.compile(r"^[A-Za-z0-9_.:+-]{1,160}$")
_BOUNDED_EVENT = re.compile(r"^[A-Z][A-Z0-9_]{2,79}$")
_CANONICAL_INSTANT = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$"
)
_SENSITIVE_VALUE = re.compile(
    r"authorization|cookie|credential|password|private.?key|secret|session.?token|token",
    re.IGNORECASE,
)
_IDENTIFIER_KEY = re.compile(
    r"^(?:actor|client|correlation|document|email|event|file|fileobject|"
    r"ingestionrequest|job|matter|node|queue|request|scan|session|target|"
    r"tenant|user|version)(?:id|ids|ref|refs)$"
)
_SENSITIVE_KEY_SUFFIX = re.compile(
    r"(?:authorization|body|bodytext|content|contents|cookie|credential|"
    r"filename|host|hostname|ip|ipaddress|objectkey|password|path|privatekey|"
    r"raw|secret|sessiontoken|snippet|stack|storageuri|text|token|trace|uri|url)$"
)


def _normalized_key(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", value).lower()


def safe_reference(value: str) -> str:
    """Return a non-reversible cross-language SHA-256 reference."""

    return f"ref:{sha256(value.encode('utf-8')).hexdigest()[:16]}"


def _sanitize_scalar(value):
    if not isinstance(value, str):
        return value
    if _SAFE_REFERENCE.fullmatch(value):
        return value
    if _RAW_UUID.fullmatch(value):
        return safe_reference(value.lower())
    if _CANONICAL_INSTANT.fullmatch(value):
        return value
    if (
        len(value) > 160
        or "\n" in value
        or "\r" in value
        or "/" in value
        or "\\" in value
        or _SENSITIVE_VALUE.search(value)
        or not _BOUNDED_SCALAR.fullmatch(value)
    ):
        return REDACTED
    return value


def _hashed_identifier(value):
    if isinstance(value, list):
        return [_hashed_identifier(item) for item in value]
    if isinstance(value, str):
        return value if _SAFE_REFERENCE.fullmatch(value) else safe_reference(value)
    if isinstance(value, int) and not isinstance(value, bool):
        return safe_reference(str(value))
    if value is None:
        return value
    return REDACTED


def sanitize_log_value(value):
    """Recursively retain only closed fields, safe references, and bounded values."""

    if isinstance(value, list):
        return [sanitize_log_value(item) for item in value]
    if not isinstance(value, dict):
        return _sanitize_scalar(value)
    result = {}
    for key, item in value.items():
        normalized = _normalized_key(str(key))
        if normalized == "context":
            result[key] = sanitize_log_value(item)
        elif _SENSITIVE_KEY_SUFFIX.search(normalized):
            result[key] = REDACTED
        elif normalized in {"id", "nonce"} or _IDENTIFIER_KEY.fullmatch(normalized):
            result[key] = _hashed_identifier(item)
        else:
            result[key] = sanitize_log_value(item)
    return result


def emit_ingestion_event(
    event: str,
    *,
    request_id: str | None,
    outcome: str,
    status: str,
    duration_ms: int,
    stream: TextIO | None = None,
) -> None:
    """Write one fixed-schema JSON event without route, client, or payload data."""

    payload = {
        "event": event if _BOUNDED_EVENT.fullmatch(event) else "LOG_EVENT",
        "outcome": outcome if outcome in {"denied", "failure", "success"} else "unknown",
        "status": status if status in {"2xx", "3xx", "4xx", "5xx"} else "unknown",
        "durationMs": max(0, min(int(duration_ms), 7 * 24 * 60 * 60 * 1000)),
    }
    if request_id is not None:
        payload["requestRef"] = safe_reference(request_id)
    target = stream or sys.stdout
    target.write(json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n")
    target.flush()
