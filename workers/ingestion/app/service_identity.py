"""Gateway-verified API identity and one-use request binding for future ingestion routes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
from typing import Mapping, MutableMapping, Protocol

from .replay_store import SqliteNonceReplayStore

INGESTION_WORKER_AUDIENCE = "amic-vault-ingestion"
INGESTION_GATEWAY_WORKLOAD_SUBJECT = "amic-vault-api"
IDENTITY_TTL = timedelta(minutes=5)
PERMISSION_DENIED = "PERMISSION_DENIED"

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
_INSTANT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


class ServiceIdentityDenied(ValueError):
    """Expose only the standard fail-closed error code."""

    code = PERMISSION_DENIED

    def __init__(self) -> None:
        super().__init__(self.code)


def _instant(value: str) -> datetime:
    if not _INSTANT.fullmatch(value):
        raise ServiceIdentityDenied()
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def _header(headers: Mapping[str, str], name: str) -> str | None:
    expected = name.lower()
    for key, value in headers.items():
        if key.lower() == expected:
            return value
    return None


class NonceReplayStore(Protocol):
    def consume(self, nonce: str, expires_at: datetime, now: datetime) -> bool: ...


class InMemoryNonceReplayStore:
    """Test/dev implementation; production must provide a gateway-backed durable store."""

    def __init__(self) -> None:
        self._seen: MutableMapping[str, datetime] = {}

    def consume(self, nonce: str, expires_at: datetime, now: datetime) -> bool:
        self._seen = {value: expiry for value, expiry in self._seen.items() if expiry > now}
        if nonce in self._seen:
            return False
        self._seen[nonce] = expires_at
        return True


@dataclass(frozen=True)
class VerifiedWorkloadIdentity:
    subject: str
    audience: str
    request_id: str
    nonce: str
    expires_at: datetime


class PrivateGatewayMtlsServiceIdentity:
    """Trust only headers injected after the private gateway's mTLS check."""

    def __init__(self, nonce_store: NonceReplayStore) -> None:
        self._nonce_store = nonce_store

    def verify(self, headers: Mapping[str, str], now: datetime | None = None) -> VerifiedWorkloadIdentity:
        current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        verified = _header(headers, "x-amic-gateway-mtls-verified")
        subject = _header(headers, "x-amic-gateway-workload-subject")
        audience = _header(headers, "x-amic-gateway-audience")
        request_id = _header(headers, "x-amic-request-id")
        nonce = _header(headers, "x-amic-ingestion-nonce")
        expires_at_value = _header(headers, "x-amic-ingestion-expires-at")
        if (
            verified != "true"
            or subject != INGESTION_GATEWAY_WORKLOAD_SUBJECT
            or audience != INGESTION_WORKER_AUDIENCE
            or request_id is None
            or nonce is None
            or expires_at_value is None
            or _UUID.fullmatch(request_id) is None
            or _UUID.fullmatch(nonce) is None
        ):
            raise ServiceIdentityDenied()
        expires_at = _instant(expires_at_value)
        if expires_at <= current or expires_at > current + IDENTITY_TTL:
            raise ServiceIdentityDenied()
        try:
            consumed = self._nonce_store.consume(nonce, expires_at, current)
        except Exception as exc:
            raise ServiceIdentityDenied() from exc
        if not consumed:
            raise ServiceIdentityDenied()
        return VerifiedWorkloadIdentity(subject, audience, request_id, nonce, expires_at)


class DevelopmentLoopbackServiceIdentity:
    """Dev-only binding; network loopback remains a deployment responsibility."""

    def __init__(self, nonce_store: NonceReplayStore) -> None:
        self._nonce_store = nonce_store

    def verify(self, headers: Mapping[str, str], now: datetime | None = None) -> VerifiedWorkloadIdentity:
        current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        request_id = _header(headers, "x-amic-request-id")
        nonce = _header(headers, "x-amic-ingestion-nonce")
        expires_at_value = _header(headers, "x-amic-ingestion-expires-at")
        if (
            _header(headers, "x-amic-dev-loopback-identity") != "true"
            or request_id is None
            or nonce is None
            or expires_at_value is None
            or _UUID.fullmatch(request_id) is None
            or _UUID.fullmatch(nonce) is None
        ):
            raise ServiceIdentityDenied()
        expires_at = _instant(expires_at_value)
        if expires_at <= current or expires_at > current + IDENTITY_TTL:
            raise ServiceIdentityDenied()
        try:
            consumed = self._nonce_store.consume(nonce, expires_at, current)
        except Exception as exc:
            raise ServiceIdentityDenied() from exc
        if not consumed:
            raise ServiceIdentityDenied()
        return VerifiedWorkloadIdentity(
            INGESTION_GATEWAY_WORKLOAD_SUBJECT,
            INGESTION_WORKER_AUDIENCE,
            request_id,
            nonce,
            expires_at,
        )


def assert_service_identity_profile(env: Mapping[str, str]) -> None:
    """Reject dev loopback and incomplete private-gateway configuration in production."""
    profile = env.get("INGESTION_WORKER_IDENTITY_PROFILE", "loopback-dev")
    if profile == "loopback-dev":
        if env.get("NODE_ENV") == "production":
            raise ServiceIdentityDenied()
        return
    if profile != "private-gateway-mtls" or any(
        env.get(name) != expected
        for name, expected in {
            "INGESTION_GATEWAY_MTLS_ENABLED": "true",
            "INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS": "true",
            "INGESTION_GATEWAY_DIRECT_WORKER_ACCESS": "blocked",
            "INGESTION_GATEWAY_WORKLOAD_SUBJECT": INGESTION_GATEWAY_WORKLOAD_SUBJECT,
            "INGESTION_GATEWAY_AUDIENCE": INGESTION_WORKER_AUDIENCE,
        }.items()
    ):
        raise ServiceIdentityDenied()
    nonce_store_path = env.get("INGESTION_NONCE_STORE_PATH", "")
    if "\x00" in nonce_store_path or not Path(nonce_store_path).is_absolute():
        raise ServiceIdentityDenied()


def create_nonce_replay_store(env: Mapping[str, str]) -> NonceReplayStore:
    """Use memory only for development; private production must open durable SQLite."""
    assert_service_identity_profile(env)
    if env.get("INGESTION_WORKER_IDENTITY_PROFILE", "loopback-dev") == "private-gateway-mtls":
        try:
            return SqliteNonceReplayStore(env["INGESTION_NONCE_STORE_PATH"])
        except (KeyError, RuntimeError) as exc:
            raise ServiceIdentityDenied() from exc
    return InMemoryNonceReplayStore()


def verify_ingestion_request_identity(
    headers: Mapping[str, str],
    *,
    env: Mapping[str, str] = {},
    nonce_store: NonceReplayStore,
    now: datetime | None = None,
) -> VerifiedWorkloadIdentity:
    assert_service_identity_profile(env)
    if env.get("INGESTION_WORKER_IDENTITY_PROFILE", "loopback-dev") == "private-gateway-mtls":
        return PrivateGatewayMtlsServiceIdentity(nonce_store).verify(headers, now)
    return DevelopmentLoopbackServiceIdentity(nonce_store).verify(headers, now)
