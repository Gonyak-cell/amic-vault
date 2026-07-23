"""Fail-closed storage and scanner destination policy for private ingestion."""

from __future__ import annotations

from dataclasses import dataclass, field
from ipaddress import IPv4Address, IPv6Address, ip_address, ip_network
import os
import re
import socket
from threading import Lock
from typing import Callable, Mapping
from urllib.parse import urlsplit


class EgressPolicyDenied(RuntimeError):
    def __init__(self, reason_code: str) -> None:
        self.reason_code = reason_code
        super().__init__(reason_code)


Address = IPv4Address | IPv6Address
Resolver = Callable[[str, int], set[Address]]

_HOST = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*"
    r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$"
)
_MAX_CIDRS = 16
_PRIVATE_NETWORKS = tuple(
    ip_network(value)
    for value in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "fc00::/7")
)


def _authority(value: str) -> tuple[str, int]:
    if not value or len(value) > 320 or any(char.isspace() for char in value):
        raise EgressPolicyDenied("EGRESS_AUTHORITY_INVALID")
    parsed = urlsplit(f"//{value}")
    try:
        port = parsed.port
    except ValueError as exc:
        raise EgressPolicyDenied("EGRESS_AUTHORITY_INVALID") from exc
    host = (parsed.hostname or "").lower()
    if (
        parsed.username is not None
        or parsed.password is not None
        or parsed.path
        or parsed.query
        or parsed.fragment
        or port is None
        or port < 1
        or port > 65535
        or not _HOST.fullmatch(host)
    ):
        raise EgressPolicyDenied("EGRESS_AUTHORITY_INVALID")
    # Python's ipaddress intentionally rejects legacy integer/octal IPv4
    # spellings. They must still be treated as ambiguous literal addresses,
    # never as DNS names.
    if host.isdecimal() or host.startswith(("0x", "0X")):
        raise EgressPolicyDenied("EGRESS_LITERAL_IP_DENIED")
    try:
        ip_address(host)
    except ValueError:
        pass
    else:
        raise EgressPolicyDenied("EGRESS_LITERAL_IP_DENIED")
    return host, port


def _networks(value: str):
    raw = value.split(",")
    if not 1 <= len(raw) <= _MAX_CIDRS:
        raise EgressPolicyDenied("EGRESS_CIDR_SET_INVALID")
    networks = []
    for item in raw:
        if item != item.strip() or not item:
            raise EgressPolicyDenied("EGRESS_CIDR_SET_INVALID")
        try:
            network = ip_network(item, strict=True)
        except ValueError as exc:
            raise EgressPolicyDenied("EGRESS_CIDR_SET_INVALID") from exc
        if network.prefixlen == 0:
            raise EgressPolicyDenied("EGRESS_CIDR_SET_INVALID")
        network_address = network.network_address
        if (
            network_address.is_loopback
            or network_address.is_link_local
            or network_address.is_multicast
            or network_address.is_unspecified
            or not any(
                network.version == private.version and network.subnet_of(private)
                for private in _PRIVATE_NETWORKS
            )
        ):
            raise EgressPolicyDenied("EGRESS_CIDR_SET_INVALID")
        networks.append(network)
    if len(set(networks)) != len(networks):
        raise EgressPolicyDenied("EGRESS_CIDR_SET_INVALID")
    return tuple(networks)


def _system_resolver(host: str, port: int) -> set[Address]:
    try:
        records = socket.getaddrinfo(
            host,
            port,
            family=socket.AF_UNSPEC,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
        addresses = {ip_address(record[4][0]) for record in records}
    except (OSError, ValueError) as exc:
        raise EgressPolicyDenied("EGRESS_DNS_UNAVAILABLE") from exc
    if not addresses:
        raise EgressPolicyDenied("EGRESS_DNS_UNAVAILABLE")
    return addresses


@dataclass
class FixedEgressPolicy:
    storage_host: str
    storage_port: int
    clamav_host: str
    clamav_port: int
    allowed_networks: tuple
    resolver: Resolver = field(default=_system_resolver, repr=False)
    _pinned_answers: dict[str, frozenset[Address]] = field(default_factory=dict, repr=False)
    _lock: Lock = field(default_factory=Lock, repr=False)

    @classmethod
    def from_env(
        cls,
        env: Mapping[str, str] = os.environ,
        *,
        resolver: Resolver = _system_resolver,
    ) -> "FixedEgressPolicy":
        storage_host, storage_port = _authority(
            env.get("INGESTION_EGRESS_STORAGE_AUTHORITY", "")
        )
        clamav_host, clamav_port = _authority(
            env.get("INGESTION_EGRESS_CLAMAV_AUTHORITY", "")
        )
        return cls(
            storage_host=storage_host,
            storage_port=storage_port,
            clamav_host=clamav_host,
            clamav_port=clamav_port,
            allowed_networks=_networks(env.get("INGESTION_EGRESS_ALLOWED_CIDRS", "")),
            resolver=resolver,
        )

    def _assert_answers(self, name: str, host: str, port: int) -> None:
        answers = self.resolver(host, port)
        if not answers:
            raise EgressPolicyDenied("EGRESS_DNS_UNAVAILABLE")
        for address in answers:
            if (
                address.is_loopback
                or address.is_link_local
                or address.is_multicast
                or address.is_unspecified
                or not any(address in network for network in self.allowed_networks)
            ):
                raise EgressPolicyDenied("EGRESS_DESTINATION_DENIED")
        frozen = frozenset(answers)
        with self._lock:
            previous = self._pinned_answers.get(name)
            if previous is not None and previous != frozen:
                raise EgressPolicyDenied("EGRESS_DNS_ANSWER_CHANGED")
            self._pinned_answers[name] = frozen

    def assert_storage_endpoint(self, endpoint: str) -> None:
        parsed = urlsplit(endpoint)
        try:
            port = parsed.port or (443 if parsed.scheme == "https" else None)
        except ValueError as exc:
            raise EgressPolicyDenied("EGRESS_STORAGE_ENDPOINT_INVALID") from exc
        if (
            parsed.scheme != "https"
            or (parsed.hostname or "").lower() != self.storage_host
            or port != self.storage_port
            or parsed.username is not None
            or parsed.password is not None
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise EgressPolicyDenied("EGRESS_STORAGE_ENDPOINT_INVALID")
        self._assert_answers("storage", self.storage_host, self.storage_port)

    def assert_clamav_endpoint(self, host: str, port: int) -> None:
        if host.lower() != self.clamav_host or port != self.clamav_port:
            raise EgressPolicyDenied("EGRESS_CLAMAV_ENDPOINT_INVALID")
        self._assert_answers("clamav", self.clamav_host, self.clamav_port)


_cached_policy: FixedEgressPolicy | None = None
_cached_key: tuple[str, str, str] | None = None
_cache_lock = Lock()


def egress_enforcement_required(env: Mapping[str, str] = os.environ) -> bool:
    return env.get("INGESTION_EGRESS_ENFORCEMENT", "") == "required"


def configured_egress_policy(
    env: Mapping[str, str] = os.environ,
) -> FixedEgressPolicy | None:
    global _cached_policy, _cached_key
    if not egress_enforcement_required(env):
        return None
    key = (
        env.get("INGESTION_EGRESS_STORAGE_AUTHORITY", ""),
        env.get("INGESTION_EGRESS_CLAMAV_AUTHORITY", ""),
        env.get("INGESTION_EGRESS_ALLOWED_CIDRS", ""),
    )
    with _cache_lock:
        if _cached_policy is None or _cached_key != key:
            _cached_policy = FixedEgressPolicy.from_env(env)
            _cached_key = key
        return _cached_policy


def assert_egress_profile(env: Mapping[str, str] = os.environ) -> None:
    policy = configured_egress_policy(env)
    if policy is None:
        if env.get("INGESTION_WORKER_IDENTITY_PROFILE") == "private-gateway-mtls":
            raise EgressPolicyDenied("EGRESS_ENFORCEMENT_REQUIRED")
        return
    policy.assert_storage_endpoint(env.get("INGESTION_STORAGE_ENDPOINT", ""))
    clamav_host = env.get("INGESTION_CLAMAV_HOST", "")
    try:
        clamav_port = int(env.get("INGESTION_CLAMAV_PORT", ""), 10)
    except ValueError as exc:
        raise EgressPolicyDenied("EGRESS_CLAMAV_ENDPOINT_INVALID") from exc
    policy.assert_clamav_endpoint(clamav_host, clamav_port)
