from __future__ import annotations

from ipaddress import ip_address

import pytest

from app.egress_policy import (
    EgressPolicyDenied,
    FixedEgressPolicy,
    assert_egress_profile,
)


BASE_ENV = {
    "INGESTION_WORKER_IDENTITY_PROFILE": "private-gateway-mtls",
    "INGESTION_EGRESS_ENFORCEMENT": "required",
    "INGESTION_EGRESS_STORAGE_AUTHORITY": "storage.private.test:443",
    "INGESTION_EGRESS_CLAMAV_AUTHORITY": "clamav.private.test:3310",
    "INGESTION_EGRESS_ALLOWED_CIDRS": "10.42.0.0/24,fd42::/64",
    "INGESTION_STORAGE_ENDPOINT": "https://storage.private.test:443",
    "INGESTION_CLAMAV_HOST": "clamav.private.test",
    "INGESTION_CLAMAV_PORT": "3310",
}


def _resolver(values):
    def resolve(host: str, port: int):
        answer = values[(host, port)]
        if isinstance(answer, list):
            current = answer.pop(0)
        else:
            current = answer
        return {ip_address(value) for value in current}

    return resolve


def _policy(values=None) -> FixedEgressPolicy:
    return FixedEgressPolicy.from_env(
        BASE_ENV,
        resolver=_resolver(
            values
            or {
                ("storage.private.test", 443): {"10.42.0.10"},
                ("clamav.private.test", 3310): {"10.42.0.11"},
            }
        ),
    )


def _reason(call) -> str:
    with pytest.raises(EgressPolicyDenied) as caught:
        call()
    return caught.value.reason_code


def test_fixed_storage_and_clamav_private_destinations_pass() -> None:
    policy = _policy()
    policy.assert_storage_endpoint("https://storage.private.test:443")
    policy.assert_clamav_endpoint("clamav.private.test", 3310)


@pytest.mark.parametrize(
    ("authority", "reason"),
    [
        ("", "EGRESS_AUTHORITY_INVALID"),
        ("user@storage.private.test:443", "EGRESS_AUTHORITY_INVALID"),
        ("storage.private.test", "EGRESS_AUTHORITY_INVALID"),
        ("storage.private.test:0", "EGRESS_AUTHORITY_INVALID"),
        ("127.0.0.1:443", "EGRESS_LITERAL_IP_DENIED"),
        ("2130706433:443", "EGRESS_LITERAL_IP_DENIED"),
        ("[::ffff:127.0.0.1]:443", "EGRESS_AUTHORITY_INVALID"),
        ("storage.private.test.evil:443/path", "EGRESS_AUTHORITY_INVALID"),
    ],
)
def test_ambiguous_or_literal_authority_fails(authority: str, reason: str) -> None:
    env = {**BASE_ENV, "INGESTION_EGRESS_STORAGE_AUTHORITY": authority}
    assert _reason(lambda: FixedEgressPolicy.from_env(env)) == reason


@pytest.mark.parametrize(
    "cidrs",
    [
        "8.8.8.0/24",
        "100.64.0.0/10",
        "192.0.2.0/24",
        "2001:4860::/32",
    ],
)
def test_public_shared_and_documentation_cidrs_cannot_be_approved(cidrs: str) -> None:
    env = {**BASE_ENV, "INGESTION_EGRESS_ALLOWED_CIDRS": cidrs}
    assert _reason(lambda: FixedEgressPolicy.from_env(env)) == "EGRESS_CIDR_SET_INVALID"


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://storage.private.test:443",
        "https://storage.private.test:444",
        "https://evil.private.test:443",
        "https://storage.private.test:443/object",
        "https://storage.private.test:443/?next=https://evil.test",
        "https://user@storage.private.test:443",
    ],
)
def test_storage_endpoint_cannot_redirect_or_change_authority(endpoint: str) -> None:
    assert _reason(lambda: _policy().assert_storage_endpoint(endpoint)) == (
        "EGRESS_STORAGE_ENDPOINT_INVALID"
    )


@pytest.mark.parametrize(
    "address",
    [
        "169.254.169.254",
        "127.0.0.1",
        "0.0.0.0",
        "224.0.0.1",
        "8.8.8.8",
        "10.43.0.10",
        "::1",
        "2001:4860:4860::8888",
    ],
)
def test_metadata_loopback_public_and_unapproved_private_answers_fail(address: str) -> None:
    policy = _policy(
        {
            ("storage.private.test", 443): {address},
            ("clamav.private.test", 3310): {"10.42.0.11"},
        }
    )
    assert _reason(
        lambda: policy.assert_storage_endpoint("https://storage.private.test:443")
    ) == "EGRESS_DESTINATION_DENIED"


def test_mixed_answer_and_dns_rebinding_fail_closed() -> None:
    mixed = _policy(
        {
            ("storage.private.test", 443): {"10.42.0.10", "8.8.8.8"},
            ("clamav.private.test", 3310): {"10.42.0.11"},
        }
    )
    assert _reason(
        lambda: mixed.assert_storage_endpoint("https://storage.private.test:443")
    ) == "EGRESS_DESTINATION_DENIED"

    rebound = _policy(
        {
            ("storage.private.test", 443): [
                {"10.42.0.10"},
                {"10.42.0.12"},
            ],
            ("clamav.private.test", 3310): {"10.42.0.11"},
        }
    )
    rebound.assert_storage_endpoint("https://storage.private.test:443")
    assert _reason(
        lambda: rebound.assert_storage_endpoint("https://storage.private.test:443")
    ) == "EGRESS_DNS_ANSWER_CHANGED"


def test_private_profile_requires_egress_enforcement() -> None:
    assert _reason(
        lambda: assert_egress_profile(
            {"INGESTION_WORKER_IDENTITY_PROFILE": "private-gateway-mtls"}
        )
    ) == "EGRESS_ENFORCEMENT_REQUIRED"
