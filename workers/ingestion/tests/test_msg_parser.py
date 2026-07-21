from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from hashlib import sha256

from app.parsers.email import parse_msg_skeleton


class FakeEmbeddedMsg:
    def __init__(self, payload: bytes) -> None:
        self.payload = payload

    def exportBytes(self) -> bytes:
        return self.payload


class FakeAttachment:
    def __init__(self, filename: str, data, mimetype: str | None = None) -> None:
        self.filename = filename
        self.data = data
        self.mimetype = mimetype

    def getFilename(self) -> str:
        return self.filename


class FakeMsg:
    def __init__(
        self,
        *,
        subject: str = "검토 요청",
        body: str | None = "본문",
        html_body: bytes | str | None = None,
        rtf_body: bytes | str | None = None,
        attachments: list[FakeAttachment] | None = None,
    ) -> None:
        self.subject = subject
        self.body = body
        self.htmlBody = html_body
        self.rtfBody = rtf_body
        self.messageId = "<Case-MSG@Example.TEST>"
        self.date = datetime(2026, 6, 12, 10, 15, 30, tzinfo=timezone(timedelta(hours=9)))
        self.sender = "Sender <sender@example.test>"
        self.to = "Internal <internal@amic.test>; Outside <outside@example.test>"
        self.cc = None
        self.header = (
            "References: <thread-001@example.test>\r\n"
            "In-Reply-To: <parent-001@example.test>\r\n"
        )
        self.attachments = attachments or []
        self.closed = False

    def close(self) -> None:
        self.closed = True


def _parse(fake_msg: FakeMsg):
    return parse_msg_skeleton(b"fake msg bytes", opener=lambda _path: fake_msg)


def test_msg_parser_extracts_korean_subject_participants_and_thread_headers() -> None:
    result = _parse(FakeMsg(subject="한국어 제목"))

    assert result.parser == "msg"
    assert result.status == "parsed"
    assert result.normalized_message_id == "case-msg@example.test"
    assert result.subject == "한국어 제목"
    assert result.sent_at == "2026-06-12T10:15:30+09:00"
    assert result.references == ("thread-001@example.test", "parent-001@example.test")
    assert [participant.role for participant in result.participants] == ["from", "to", "to"]
    assert result.participants[0].normalized_address == "sender@example.test"


def test_msg_parser_decodes_cp949_rtf_body_fallback() -> None:
    result = _parse(FakeMsg(body=None, rtf_body="한글 본문".encode("cp949")))

    assert result.status == "parsed"
    assert result.body_text == "한글 본문"


def test_msg_parser_extracts_pdf_attachment_payload() -> None:
    payload = b"%PDF-1.7\nattachment\n%%EOF\n"
    result = _parse(FakeMsg(attachments=[FakeAttachment("../unsafe?.pdf", payload, "application/pdf")]))

    assert result.status == "parsed"
    assert len(result.attachments) == 1
    attachment = result.attachments[0]
    assert attachment.normalized_filename == "unsafe_.pdf"
    assert attachment.media_type == "application/pdf"
    assert attachment.size_bytes == len(payload)
    assert attachment.sha256 == sha256(payload).hexdigest()
    assert base64.b64decode(attachment.body_base64 or "") == payload


def test_msg_parser_keeps_embedded_msg_as_original_file_attachment() -> None:
    payload = b"\xd0\xcf\x11\xe0embedded-msg"
    result = _parse(FakeMsg(attachments=[FakeAttachment("embedded-child", FakeEmbeddedMsg(payload))]))

    assert result.status == "parsed"
    assert len(result.attachments) == 1
    attachment = result.attachments[0]
    assert attachment.normalized_filename == "embedded-child.msg"
    assert attachment.media_type == "application/vnd.ms-outlook"
    assert attachment.sha256 == sha256(payload).hexdigest()
    assert base64.b64decode(attachment.body_base64 or "") == payload
