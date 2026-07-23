from datetime import datetime, timezone

import pytest

from app.service_identity import (
    INGESTION_GATEWAY_WORKLOAD_SUBJECT,
    INGESTION_WORKER_AUDIENCE,
    InMemoryNonceReplayStore,
    DevelopmentLoopbackServiceIdentity,
    PrivateGatewayMtlsServiceIdentity,
    ServiceIdentityDenied,
    assert_service_identity_profile,
    verify_ingestion_request_identity,
)


NOW = datetime(2030, 1, 1, tzinfo=timezone.utc)
HEADERS = {
    "x-amic-gateway-mtls-verified": "true",
    "x-amic-gateway-workload-subject": INGESTION_GATEWAY_WORKLOAD_SUBJECT,
    "x-amic-gateway-audience": INGESTION_WORKER_AUDIENCE,
    "x-amic-request-id": "11111111-1111-4111-8111-111111111111",
    "x-amic-ingestion-nonce": "22222222-2222-4222-8222-222222222222",
    "x-amic-ingestion-expires-at": "2030-01-01T00:05:00Z",
}
GATEWAY_ENV = {
    "NODE_ENV": "production",
    "INGESTION_WORKER_IDENTITY_PROFILE": "private-gateway-mtls",
    "INGESTION_GATEWAY_MTLS_ENABLED": "true",
    "INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS": "true",
    "INGESTION_GATEWAY_DIRECT_WORKER_ACCESS": "blocked",
    "INGESTION_GATEWAY_WORKLOAD_SUBJECT": INGESTION_GATEWAY_WORKLOAD_SUBJECT,
    "INGESTION_GATEWAY_AUDIENCE": INGESTION_WORKER_AUDIENCE,
    "INGESTION_NONCE_STORE_PATH": "/var/lib/amic-vault/replay/nonces.sqlite3",
}


def test_private_gateway_identity_accepts_only_verified_matching_short_lived_binding() -> None:
    identity = PrivateGatewayMtlsServiceIdentity(InMemoryNonceReplayStore()).verify(HEADERS, NOW)

    assert identity.subject == INGESTION_GATEWAY_WORKLOAD_SUBJECT
    assert identity.audience == INGESTION_WORKER_AUDIENCE
    assert identity.request_id == HEADERS["x-amic-request-id"]


@pytest.mark.parametrize(
    "override",
    [
        {"x-amic-gateway-mtls-verified": "false"},
        {"x-amic-gateway-workload-subject": "spoofed"},
        {"x-amic-gateway-audience": "other-worker"},
        {"x-amic-ingestion-expires-at": "2029-12-31T23:59:59Z"},
        {"x-amic-ingestion-expires-at": "2030-01-01T00:05:01Z"},
        {"x-amic-ingestion-nonce": "not-a-nonce"},
    ],
)
def test_private_gateway_identity_rejects_spoofed_wrong_or_expired_headers(override: dict[str, str]) -> None:
    with pytest.raises(ServiceIdentityDenied, match="PERMISSION_DENIED"):
        PrivateGatewayMtlsServiceIdentity(InMemoryNonceReplayStore()).verify({**HEADERS, **override}, NOW)


def test_private_gateway_identity_rejects_replay_and_direct_port_headers() -> None:
    verifier = PrivateGatewayMtlsServiceIdentity(InMemoryNonceReplayStore())
    verifier.verify(HEADERS, NOW)
    rotated_gateway_request = {**HEADERS, "x-amic-ingestion-nonce": "33333333-3333-4333-8333-333333333333"}
    assert verifier.verify(rotated_gateway_request, NOW).nonce == rotated_gateway_request["x-amic-ingestion-nonce"]
    with pytest.raises(ServiceIdentityDenied, match="PERMISSION_DENIED"):
        verifier.verify(HEADERS, NOW)
    with pytest.raises(ServiceIdentityDenied, match="PERMISSION_DENIED"):
        PrivateGatewayMtlsServiceIdentity(InMemoryNonceReplayStore()).verify(
            {key: value for key, value in HEADERS.items() if key != "x-amic-gateway-mtls-verified"},
            NOW,
        )


def test_private_gateway_identity_fails_closed_when_the_nonce_store_is_unavailable() -> None:
    class UnavailableNonceStore:
        def consume(self, nonce: str, expires_at: datetime, now: datetime) -> bool:
            raise RuntimeError("unavailable")

    with pytest.raises(ServiceIdentityDenied, match="PERMISSION_DENIED"):
        PrivateGatewayMtlsServiceIdentity(UnavailableNonceStore()).verify(HEADERS, NOW)


def test_private_gateway_profile_requires_enforcement_and_production_rejects_loopback() -> None:
    assert_service_identity_profile(GATEWAY_ENV)
    with pytest.raises(ServiceIdentityDenied, match="PERMISSION_DENIED"):
        assert_service_identity_profile({**GATEWAY_ENV, "INGESTION_GATEWAY_DIRECT_WORKER_ACCESS": "allowed"})
    with pytest.raises(ServiceIdentityDenied, match="PERMISSION_DENIED"):
        assert_service_identity_profile(
            {"NODE_ENV": "production", "INGESTION_WORKER_IDENTITY_PROFILE": "loopback-dev"}
        )


def test_development_loopback_identity_is_explicit_short_lived_and_one_use() -> None:
    headers = {
        "x-amic-dev-loopback-identity": "true",
        "x-amic-request-id": HEADERS["x-amic-request-id"],
        "x-amic-ingestion-nonce": HEADERS["x-amic-ingestion-nonce"],
        "x-amic-ingestion-expires-at": HEADERS["x-amic-ingestion-expires-at"],
    }
    verifier = DevelopmentLoopbackServiceIdentity(InMemoryNonceReplayStore())
    identity = verifier.verify(headers, NOW)
    assert identity.audience == INGESTION_WORKER_AUDIENCE
    with pytest.raises(ServiceIdentityDenied, match="PERMISSION_DENIED"):
        verifier.verify(headers, NOW)
    with pytest.raises(ServiceIdentityDenied, match="PERMISSION_DENIED"):
        DevelopmentLoopbackServiceIdentity(InMemoryNonceReplayStore()).verify(
            {key: value for key, value in headers.items() if key != "x-amic-dev-loopback-identity"}, NOW
        )


def test_identity_profile_selects_gateway_in_production_and_loopback_only_outside_it() -> None:
    assert verify_ingestion_request_identity(
        HEADERS,
        env=GATEWAY_ENV,
        nonce_store=InMemoryNonceReplayStore(),
        now=NOW,
    ).subject == INGESTION_GATEWAY_WORKLOAD_SUBJECT
    with pytest.raises(ServiceIdentityDenied, match="PERMISSION_DENIED"):
        verify_ingestion_request_identity(
            HEADERS,
            env={"NODE_ENV": "production", "INGESTION_WORKER_IDENTITY_PROFILE": "loopback-dev"},
            nonce_store=InMemoryNonceReplayStore(),
            now=NOW,
        )
