from __future__ import annotations

import socket
import os
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from re import compile as compile_pattern
from typing import Mapping

from app.egress_policy import EgressPolicyDenied, configured_egress_policy


class ScanOutcome(StrEnum):
    CLEAN = "clean"
    INFECTED = "infected"
    ERROR = "error"
    STALE_SIGNATURE = "stale_signature"


@dataclass(frozen=True)
class ScannerHealth:
    engine_version: str
    signature_age_seconds: int


@dataclass(frozen=True)
class ScanVerdict:
    outcome: ScanOutcome
    engine_version: str | None = None
    signature_age_seconds: int | None = None


class ClamAvClient:
    """Minimal, fail-closed ClamAV INSTREAM client; never retains scan content."""

    _version_pattern = compile_pattern(r"^ClamAV ([^/\s]+)/\d+/(.+)$")

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        timeout_seconds: float = 5,
        max_bytes: int = 25 * 1024 * 1024,
        max_chunk_bytes: int = 1024 * 1024,
        max_signature_age: timedelta = timedelta(days=7),
        now: Callable[[], datetime] | None = None,
        env: Mapping[str, str] = os.environ,
    ) -> None:
        resolved_host = host if host is not None else env.get("INGESTION_CLAMAV_HOST", "clamav")
        try:
            resolved_port = (
                port
                if port is not None
                else int(env.get("INGESTION_CLAMAV_PORT", "3310"), 10)
            )
        except ValueError as exc:
            raise ValueError("invalid ClamAV client bounds") from exc
        if (
            resolved_port < 1
            or resolved_port > 65535
            or timeout_seconds <= 0
            or max_bytes < 1
            or max_chunk_bytes < 1
        ):
            raise ValueError("invalid ClamAV client bounds")
        policy = configured_egress_policy(env)
        if policy is not None:
            try:
                policy.assert_clamav_endpoint(resolved_host, resolved_port)
            except EgressPolicyDenied as exc:
                raise ValueError("invalid ClamAV client bounds") from exc
        self._host = resolved_host
        self._port = resolved_port
        self._timeout_seconds = timeout_seconds
        self._max_bytes = max_bytes
        self._max_chunk_bytes = max_chunk_bytes
        self._max_signature_age = max_signature_age
        self._now = now or (lambda: datetime.now(UTC))

    def scan(self, payload: bytes) -> ScanVerdict:
        if len(payload) > self._max_bytes:
            return ScanVerdict(ScanOutcome.ERROR)
        return self.scan_chunks((payload,))

    def scan_chunks(self, chunks: Iterable[bytes]) -> ScanVerdict:
        try:
            response = self._stream(chunks)
            if response.endswith(" OK"):
                health = self.health()
                if health.signature_age_seconds > int(self._max_signature_age.total_seconds()):
                    return ScanVerdict(ScanOutcome.STALE_SIGNATURE, health.engine_version, health.signature_age_seconds)
                return ScanVerdict(ScanOutcome.CLEAN, health.engine_version, health.signature_age_seconds)
            if response.endswith(" FOUND"):
                return ScanVerdict(ScanOutcome.INFECTED)
        except (OSError, TimeoutError, ValueError):
            pass
        return ScanVerdict(ScanOutcome.ERROR)

    def health(self) -> ScannerHealth:
        response = self._request(b"zVERSION\0")
        match = self._version_pattern.fullmatch(response)
        if match is None:
            raise ValueError("malformed ClamAV version response")
        timestamp = datetime.strptime(match.group(2), "%a %b %d %H:%M:%S %Y").replace(tzinfo=UTC)
        return ScannerHealth(
            engine_version=match.group(1),
            signature_age_seconds=max(0, int((self._now() - timestamp).total_seconds())),
        )

    def _stream(self, chunks: Iterable[bytes]) -> str:
        connection = self._connect()
        try:
            connection.sendall(b"zINSTREAM\0")
            total = 0
            for chunk in chunks:
                if not isinstance(chunk, bytes):
                    raise ValueError("scan chunks must be bytes")
                total += len(chunk)
                if total > self._max_bytes:
                    raise ValueError("scan input exceeds configured limit")
                for offset in range(0, len(chunk), self._max_chunk_bytes):
                    part = chunk[offset : offset + self._max_chunk_bytes]
                    connection.sendall(len(part).to_bytes(4, "big") + part)
            connection.sendall(b"\0\0\0\0")
            return self._receive(connection)
        finally:
            connection.close()

    def _request(self, command: bytes) -> str:
        connection = self._connect()
        try:
            connection.sendall(command)
            return self._receive(connection)
        finally:
            connection.close()

    def _connect(self) -> socket.socket:
        connection = socket.create_connection((self._host, self._port), timeout=self._timeout_seconds)
        connection.settimeout(self._timeout_seconds)
        return connection

    @staticmethod
    def _receive(connection: socket.socket) -> str:
        reply = bytearray()
        while len(reply) < 4096:
            block = connection.recv(min(1024, 4096 - len(reply)))
            if not block:
                break
            reply.extend(block)
            if b"\0" in block:
                break
        terminator = reply.find(0)
        if terminator < 0:
            raise ValueError("unterminated ClamAV response")
        return bytes(reply[:terminator]).decode("ascii", errors="strict")
