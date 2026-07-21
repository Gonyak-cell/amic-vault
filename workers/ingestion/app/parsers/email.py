from __future__ import annotations

import base64
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import datetime
from email import policy
from email.parser import BytesParser, Parser
from email.utils import getaddresses, parsedate_to_datetime
from hashlib import sha256
from html import unescape
import mimetypes
from pathlib import PurePath
import re
import tempfile


@dataclass(frozen=True)
class EmailParticipant:
    role: str
    normalized_address: str
    domain_ref: str
    display_name: str | None = None


@dataclass(frozen=True)
class EmailAttachment:
    attachment_index: int
    normalized_filename: str
    media_type: str
    size_bytes: int
    sha256: str
    body_base64: str | None = field(default=None, repr=False)


@dataclass(frozen=True)
class EmailParseResult:
    parser: str
    status: str
    normalized_message_id: str | None = None
    subject: str | None = None
    sent_at: str | None = None
    received_at: str | None = None
    metadata_warning_code: str | None = None
    body_text: str | None = field(default=None, repr=False)
    references: tuple[str, ...] = ()
    participants: tuple[EmailParticipant, ...] = ()
    attachments: tuple[EmailAttachment, ...] = ()
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


def _received_date_iso(value: str | None) -> str | None:
    if value is None or ";" not in value:
        return None
    return _date_iso(value.rsplit(";", 1)[-1].strip())


def _references(values: list[str]) -> tuple[str, ...]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        for candidate in re.findall(r"<([^<>\s]+)>", value):
            normalized = candidate.strip().lower()
            if not normalized or len(normalized) > 256 or normalized in seen:
                continue
            seen.add(normalized)
            output.append(normalized)
            if len(output) >= 50:
                return tuple(output)
    return tuple(output)


def _safe_filename(value: str | None, index: int) -> str:
    name = PurePath(value or f"attachment-{index}").name
    normalized = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip()
    if normalized in {"", ".", ".."}:
        normalized = f"attachment-{index}"
    return normalized[:255]


def _attachments(message) -> tuple[EmailAttachment, ...]:
    output: list[EmailAttachment] = []
    for part in message.iter_attachments():
        payload = part.get_payload(decode=True)
        if payload is None:
            continue
        index = len(output)
        media_type = part.get_content_type().lower()
        output.append(
            EmailAttachment(
                attachment_index=index,
                normalized_filename=_safe_filename(part.get_filename(), index),
                media_type=media_type,
                size_bytes=len(payload),
                sha256=sha256(payload).hexdigest(),
            )
        )
    return tuple(output)


def parse_eml_envelope(payload: bytes) -> EmailParseResult:
    try:
        message = BytesParser(policy=policy.default).parsebytes(payload)
        sent_at = _date_iso(message.get("Date"))
        received_at = _received_date_iso(message.get("Received"))
        metadata_warning_code = (
            "MALFORMED_DATE"
            if (message.get("Date") and sent_at is None)
            or (message.get("Received") and received_at is None)
            else None
        )
        return EmailParseResult(
            parser="eml",
            status="parsed",
            normalized_message_id=_normalize_message_id(message.get("Message-ID")),
            subject=_bounded(message.get("Subject"), 500),
            sent_at=sent_at,
            received_at=received_at,
            metadata_warning_code=metadata_warning_code,
            references=_references(
                [*message.get_all("References", []), *message.get_all("In-Reply-To", [])]
            ),
            participants=(
                *_participants("from", message.get_all("From", [])),
                *_participants("to", message.get_all("To", [])),
                *_participants("cc", message.get_all("Cc", [])),
            ),
            attachments=_attachments(message),
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


_BODY_TEXT_LIMIT = 200_000


def _decode_bytes(value: bytes) -> str | None:
    for encoding in ("utf-8", "cp949", "euc-kr", "latin1"):
        with suppress(UnicodeDecodeError):
            return value.decode(encoding)
    return None


def _text(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes):
        return _decode_bytes(value)
    return str(value)


def _bounded_body(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    return normalized[:_BODY_TEXT_LIMIT] or None


def _html_to_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", value)
    stripped = re.sub(r"(?s)<[^>]+>", " ", stripped)
    return _bounded_body(" ".join(unescape(stripped).split()))


def _rtf_to_text(value: object | None) -> str | None:
    text = _text(value)
    if text is None:
        return None
    rtf_bytes = value if isinstance(value, bytes) else text.encode("utf-8", errors="ignore")
    with suppress(Exception):
        from RTFDE.deencapsulate import DeEncapsulator

        deencapsulator = DeEncapsulator(rtf_bytes)
        deencapsulator.deencapsulate()
        html = _text(getattr(deencapsulator, "html", None))
        if html:
            return _html_to_text(html)
        plain = _text(getattr(deencapsulator, "text", None))
        if plain:
            return _bounded_body(plain)
        content = _text(getattr(deencapsulator, "content", None))
        if content:
            return _bounded_body(content)
    return _bounded_body(re.sub(r"\\[a-z]+-?\d* ?", " ", text).replace("{", " ").replace("}", " "))


def _header_message(value: object | None):
    text = _text(value)
    if not text:
        return None
    with suppress(Exception):
        return Parser(policy=policy.default).parsestr(text)
    return None


def _header_values(message, names: tuple[str, ...]) -> list[str]:
    output: list[str] = []
    wanted = {name.lower() for name in names}

    header_dict = getattr(message, "headerDict", None)
    if isinstance(header_dict, dict):
        for key, value in header_dict.items():
            if str(key).lower() not in wanted:
                continue
            entries = value if isinstance(value, list | tuple) else [value]
            for entry in entries:
                text = _text(entry)
                if text:
                    output.append(text)

    header = getattr(message, "header", None)
    if hasattr(header, "get_all"):
        for name in names:
            for value in header.get_all(name, []):
                text = _text(value)
                if text:
                    output.append(text)
    else:
        parsed = _header_message(header)
        if parsed is not None:
            for name in names:
                output.extend(parsed.get_all(name, []))

    return output


def _first_text(values: list[str]) -> str | None:
    for value in values:
        text = _bounded(value, 2_000)
        if text:
            return text
    return None


def _msg_date_iso(value: object | None) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return _date_iso(_text(value))


def _msg_message_id(message) -> str:
    last_error: ValueError | None = None
    for value in [getattr(message, "messageId", None), *_header_values(message, ("Message-ID",))]:
        text = _text(value)
        if not text:
            continue
        try:
            return _normalize_message_id(text)
        except ValueError as error:
            last_error = error
    if last_error:
        raise last_error
    raise ValueError("MISSING_MESSAGE_ID")


def _recipient_role(recipient) -> str | None:
    value = getattr(recipient, "type", None) or getattr(recipient, "recipientType", None)
    role_value = _text(getattr(value, "name", None) or value)
    if role_value is None:
        return None
    role = role_value.lower()
    if "bcc" in role:
        return None
    if "cc" in role:
        return "cc"
    if "to" in role:
        return "to"
    return None


def _recipient_address_value(recipient) -> str | None:
    address = _text(
        getattr(recipient, "smtpAddress", None)
        or getattr(recipient, "email", None)
        or getattr(recipient, "emailAddress", None)
    )
    display_name = _text(getattr(recipient, "name", None))
    formatted = _text(getattr(recipient, "formatted", None))
    if address and display_name:
        return f"{display_name} <{address}>"
    return formatted or address or display_name


def _msg_participants(message) -> tuple[EmailParticipant, ...]:
    from_values = [
        _text(value)
        for value in [getattr(message, "sender", None), *_header_values(message, ("From", "Sender"))]
        if _text(value)
    ]
    to_values = [
        _text(value)
        for value in [getattr(message, "to", None), *_header_values(message, ("To",))]
        if _text(value)
    ]
    cc_values = [
        _text(value)
        for value in [getattr(message, "cc", None), *_header_values(message, ("Cc",))]
        if _text(value)
    ]
    for recipient in getattr(message, "recipients", ()) or ():
        role = _recipient_role(recipient)
        value = _recipient_address_value(recipient)
        if not role or not value:
            continue
        if role == "to":
            to_values.append(value)
        if role == "cc":
            cc_values.append(value)
    return (
        *_participants("from", [value.replace(";", ",") for value in from_values if value]),
        *_participants("to", [value.replace(";", ",") for value in to_values if value]),
        *_participants("cc", [value.replace(";", ",") for value in cc_values if value]),
    )


def _call_string(method) -> str | None:
    if not callable(method):
        return None
    with suppress(Exception):
        return _text(method())
    return None


def _msg_attachment_filename(attachment, index: int, embedded_msg: bool) -> str:
    filename = (
        _call_string(getattr(attachment, "getFilename", None))
        or _text(getattr(attachment, "longFilename", None))
        or _text(getattr(attachment, "shortFilename", None))
        or _text(getattr(attachment, "name", None))
        or f"attachment-{index}{'.msg' if embedded_msg else ''}"
    )
    safe = _safe_filename(filename, index)
    if embedded_msg and not safe.lower().endswith(".msg"):
        safe = f"{safe}.msg"[:255]
    return safe


def _msg_attachment_data(attachment) -> tuple[bytes | None, bool]:
    data = getattr(attachment, "data", None)
    if data is None:
        method = getattr(attachment, "getData", None)
        if callable(method):
            with suppress(Exception):
                data = method()
    embedded_msg = hasattr(data, "exportBytes")
    if embedded_msg:
        with suppress(Exception):
            exported = data.exportBytes()
            if isinstance(exported, bytes):
                return exported, True
    if isinstance(data, bytes):
        return data, False
    if isinstance(data, str):
        return data.encode("utf-8"), False
    read = getattr(data, "read", None)
    if callable(read):
        with suppress(Exception):
            chunk = read()
            if isinstance(chunk, bytes):
                return chunk, False
    return None, embedded_msg


def _msg_attachment_media_type(filename: str, attachment, embedded_msg: bool) -> str:
    if embedded_msg:
        return "application/vnd.ms-outlook"
    explicit = _text(getattr(attachment, "mimetype", None))
    if explicit and "/" in explicit:
        return explicit.lower()
    guessed, _encoding = mimetypes.guess_type(filename)
    return (guessed or "application/octet-stream").lower()


def _msg_attachments(message) -> tuple[EmailAttachment, ...]:
    output: list[EmailAttachment] = []
    for attachment in getattr(message, "attachments", ()) or ():
        body, embedded_msg = _msg_attachment_data(attachment)
        if body is None:
            continue
        index = len(output)
        filename = _msg_attachment_filename(attachment, index, embedded_msg)
        media_type = _msg_attachment_media_type(filename, attachment, embedded_msg)
        output.append(
            EmailAttachment(
                attachment_index=index,
                normalized_filename=filename,
                media_type=media_type,
                size_bytes=len(body),
                sha256=sha256(body).hexdigest(),
                body_base64=base64.b64encode(body).decode("ascii"),
            )
        )
    return tuple(output)


def _msg_body_text(message) -> str | None:
    plain = _bounded_body(_text(getattr(message, "body", None)))
    if plain:
        return plain
    html = _html_to_text(_text(getattr(message, "htmlBody", None)))
    if html:
        return html
    return _rtf_to_text(getattr(message, "rtfBody", None))


def _open_msg_file(path: str):
    import extract_msg

    return extract_msg.openMsg(path)


def parse_msg_skeleton(payload: bytes, opener=None) -> EmailParseResult:
    msg = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".msg") as temp_file:
            temp_file.write(payload)
            temp_file.flush()
            msg = (opener or _open_msg_file)(temp_file.name)
            header_date = _first_text(_header_values(msg, ("Date",)))
            received_header = _first_text(_header_values(msg, ("Received",)))
            sent_at = _msg_date_iso(getattr(msg, "date", None)) or _date_iso(header_date)
            received_at = _received_date_iso(received_header)
            metadata_warning_code = (
                "MALFORMED_DATE"
                if ((header_date and sent_at is None) or (received_header and received_at is None))
                else None
            )
            return EmailParseResult(
                parser="msg",
                status="parsed",
                normalized_message_id=_msg_message_id(msg),
                subject=_bounded(
                    _text(getattr(msg, "subject", None))
                    or _first_text(_header_values(msg, ("Subject",))),
                    500,
                ),
                sent_at=sent_at,
                received_at=received_at,
                metadata_warning_code=metadata_warning_code,
                body_text=_msg_body_text(msg),
                references=_references(
                    [*_header_values(msg, ("References",)), *_header_values(msg, ("In-Reply-To",))]
                ),
                participants=_msg_participants(msg),
                attachments=_msg_attachments(msg),
            )
    except ValueError as error:
        return EmailParseResult(parser="msg", status="failed", failure_reason_code=str(error))
    except Exception:
        return EmailParseResult(
            parser="msg",
            status="failed",
            failure_reason_code="MALFORMED_HEADERS",
        )
    finally:
        close = getattr(msg, "close", None)
        if callable(close):
            with suppress(Exception):
                close()
