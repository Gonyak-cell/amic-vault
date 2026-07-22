from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.security.clamav_client import ClamAvClient, ScanOutcome


class FakeSocket:
    def __init__(self, reply: bytes) -> None:
        self.reply = reply
        self.sent: list[bytes] = []
        self.timeout: float | None = None
        self.closed = False

    def sendall(self, payload: bytes) -> None:
        self.sent.append(payload)

    def recv(self, _: int) -> bytes:
        result, self.reply = self.reply, b""
        return result

    def settimeout(self, timeout: float) -> None:
        self.timeout = timeout

    def close(self) -> None:
        self.closed = True


def _client(monkeypatch: pytest.MonkeyPatch, replies: list[bytes], **kwargs: object) -> tuple[ClamAvClient, list[FakeSocket]]:
    sockets: list[FakeSocket] = []

    def connect(address: tuple[str, int], timeout: float) -> FakeSocket:
        assert address == ("clamav", 3310)
        assert timeout == 5
        socket = FakeSocket(replies.pop(0))
        sockets.append(socket)
        return socket

    monkeypatch.setattr("app.security.clamav_client.socket.create_connection", connect)
    return ClamAvClient(now=lambda: datetime(2026, 7, 22, tzinfo=UTC), **kwargs), sockets


def test_clean_scan_streams_bounded_bytes_and_only_exposes_health_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    client, sockets = _client(monkeypatch, [b"stream: OK\0", b"ClamAV 1.4.3/1/Wed Jul 22 00:00:00 2026\0"])

    verdict = client.scan(b"clean")

    assert verdict.outcome == ScanOutcome.CLEAN
    assert verdict.engine_version == "1.4.3"
    assert verdict.signature_age_seconds == 0
    assert sockets[0].sent == [b"zINSTREAM\0", b"\0\0\0\x05clean", b"\0\0\0\0"]
    assert sockets[0].closed and sockets[1].closed


def test_infected_verdict_never_retains_malware_label(monkeypatch: pytest.MonkeyPatch) -> None:
    client, _ = _client(monkeypatch, [b"stream: Eicar-Test-Signature FOUND\0"])

    verdict = client.scan(b"eicar")

    assert verdict.outcome == ScanOutcome.INFECTED
    assert "Eicar" not in repr(verdict)


@pytest.mark.parametrize("reply", [b"not-a-verdict\0", b"stream: OK"])
def test_malformed_scanner_responses_fail_closed(monkeypatch: pytest.MonkeyPatch, reply: bytes) -> None:
    client, _ = _client(monkeypatch, [reply])

    assert client.scan(b"clean").outcome == ScanOutcome.ERROR


def test_timeout_and_unavailable_scanner_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    def unavailable(*_: object, **__: object) -> FakeSocket:
        raise TimeoutError("network timeout")

    monkeypatch.setattr("app.security.clamav_client.socket.create_connection", unavailable)
    assert ClamAvClient().scan(b"clean").outcome == ScanOutcome.ERROR


def test_stale_signature_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    client, _ = _client(
        monkeypatch,
        [b"stream: OK\0", b"ClamAV 1.4.3/1/Mon Jul 20 00:00:00 2026\0"],
        max_signature_age=timedelta(days=1),
    )

    assert client.scan(b"clean").outcome == ScanOutcome.STALE_SIGNATURE


def test_chunk_boundary_and_size_limit_are_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    client, sockets = _client(
        monkeypatch,
        [b"stream: OK\0", b"ClamAV 1.4.3/1/Wed Jul 22 00:00:00 2026\0"],
        max_chunk_bytes=3,
        max_bytes=5,
    )

    assert client.scan_chunks((b"abc", b"de")).outcome == ScanOutcome.CLEAN
    assert sockets[0].sent == [b"zINSTREAM\0", b"\0\0\0\x03abc", b"\0\0\0\x02de", b"\0\0\0\0"]
    assert client.scan(b"toolong").outcome == ScanOutcome.ERROR


def test_compose_scanner_is_internal_and_has_no_storage_credentials_or_mounts() -> None:
    compose = Path(__file__).parents[3] / "infra/docker-compose.dev.yml"
    scanner = compose.read_text().split("  clamav:\n", 1)[1].split("  ingestion:\n", 1)[0]

    assert "ports:" not in scanner
    assert "volumes:" not in scanner
    assert "S3_" not in scanner
    assert "CLAMD_CONF_StreamMaxLength: 25M" in scanner
    assert "clamdscan -p1" in scanner
    assert "freshclam --foreground --stdout && unset CLAMAV_NO_CLAMD && exec /init" in scanner
