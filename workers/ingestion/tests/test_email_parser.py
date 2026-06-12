from app.parsers.email import parse_eml_envelope, parse_msg_skeleton


def test_eml_parser_normalizes_message_id_without_body_text() -> None:
    result = parse_eml_envelope(
        b"From: Sender <sender@example.test>\r\n"
        b"To: Internal <internal@amic.test>, Outside <outside@example.test>\r\n"
        b"Message-ID: <Case-001@Example.TEST>\r\n"
        b"Date: Fri, 12 Jun 2026 10:15:30 +0900\r\n"
        b"Subject: Fixture\r\n"
        b"\r\n"
        b"body must not be returned"
    )

    assert result.status == "parsed"
    assert result.parser == "eml"
    assert result.normalized_message_id == "case-001@example.test"
    assert result.subject == "Fixture"
    assert result.sent_at is not None
    assert len(result.participants) == 3
    assert result.participants[0].normalized_address == "sender@example.test"
    assert "body must not be returned" not in repr(result)


def test_eml_parser_failure_does_not_emit_body_text() -> None:
    result = parse_eml_envelope(b"Subject: Missing\r\n\r\nbody must not be returned")

    assert result.status == "failed"
    assert result.failure_reason_code == "MISSING_MESSAGE_ID"
    assert "body must not be returned" not in repr(result)


def test_msg_parser_is_pending_unsupported_skeleton() -> None:
    result = parse_msg_skeleton(b"\xd0\xcf\x11\xe0not-real-msg")

    assert result.parser == "msg"
    assert result.status == "pending_unsupported"
    assert result.failure_reason_code == "UNSUPPORTED_MSG"
    assert result.normalized_message_id is None
