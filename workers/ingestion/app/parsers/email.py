from __future__ import annotations

from dataclasses import dataclass
from email import policy
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime


@dataclass(frozen=True)
class EmailParticipant:
    role: str
    normalized_address: str
    domain_ref: str
    display_name: str | None = None


@dataclass(frozen=True)
class EmailParseResult:
    parser: str
    status: str
    normalized_message_id: str | None = None
    subject: str | None = None
    sent_at: str | None = None
    participants: tuple[EmailParticipant, ...] = ()
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


def _bounded(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.strip().split())
    return normalized[:limit] or None


def _participants(role: str, values: list[str]) -> tuple[EmailParticipant, ...]:
    output: list[EmailParticipant] = []
    seen: set[tuple[str, str]] = set()
    for display_name, address in getaddresses(values):
        normalized = address.strip().lower()
        if "@" not in normalized or len(normalized) > 320:
            continue
        domain_ref = normalized.rsplit("@", 1)[-1]
        if not domain_ref or len(domain_ref) > 255:
            continue
        key = (role, normalized)
        if key in seen:
            continue
        seen.add(key)
        output.append(
            EmailParticipant(
                role=role,
                normalized_address=normalized,
                domain_ref=domain_ref,
                display_name=_bounded(display_name, 256),
            )
        )
    return tuple(output)


def _date_iso(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    return parsed.isoformat()


def parse_eml_envelope(payload: bytes) -> EmailParseResult:
    try:
        message = BytesParser(policy=policy.default).parsebytes(payload)
        return EmailParseResult(
            parser="eml",
            status="parsed",
            normalized_message_id=_normalize_message_id(message.get("Message-ID")),
            subject=_bounded(message.get("Subject"), 500),
            sent_at=_date_iso(message.get("Date")),
            participants=(
                *_participants("from", message.get_all("From", [])),
                *_participants("to", message.get_all("To", [])),
                *_participants("cc", message.get_all("Cc", [])),
            ),
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
