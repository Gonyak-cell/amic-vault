from __future__ import annotations

from dataclasses import dataclass
from email import policy
from email.parser import BytesParser


@dataclass(frozen=True)
class EmailParseResult:
    parser: str
    status: str
    normalized_message_id: str | None = None
    failure_reason_code: str | None = None


def _normalize_message_id(value: str | None) -> str:
    if value is None:
        raise ValueError("MISSING_MESSAGE_ID")
    normalized = value.strip().removeprefix("<").removesuffix(">").strip().lower()
    if not normalized or len(normalized) > 256 or any(char.isspace() for char in normalized):
        raise ValueError("MALFORMED_MESSAGE_ID")
    if "<" in normalized or ">" in normalized:
        raise ValueError("MALFORMED_MESSAGE_ID")
    return normalized


def parse_eml_envelope(payload: bytes) -> EmailParseResult:
    try:
        message = BytesParser(policy=policy.default).parsebytes(payload)
        return EmailParseResult(
            parser="eml",
            status="parsed",
            normalized_message_id=_normalize_message_id(message.get("Message-ID")),
        )
    except ValueError as error:
        return EmailParseResult(
            parser="eml",
            status="failed",
            failure_reason_code=str(error),
        )
    except Exception:
        return EmailParseResult(
            parser="eml",
            status="failed",
            failure_reason_code="MALFORMED_HEADERS",
        )


def parse_msg_skeleton(payload: bytes) -> EmailParseResult:
    # MSG parsing is intentionally deferred; preserve the original bytes upstream.
    return EmailParseResult(
        parser="msg",
        status="pending_unsupported",
        failure_reason_code="UNSUPPORTED_MSG",
    )
