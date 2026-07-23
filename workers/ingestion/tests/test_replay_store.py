from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
import os
import sqlite3

import pytest

from app.replay_store import ReplayStoreUnavailable, SqliteNonceReplayStore

NOW = datetime(2030, 1, 1, tzinfo=timezone.utc)
NONCE = "11111111-1111-4111-8111-111111111111"


def test_nonce_is_atomic_one_use_and_survives_new_process_store_instance(tmp_path: Path) -> None:
    path = tmp_path / "nonces.sqlite3"
    first = SqliteNonceReplayStore(str(path))

    assert first.consume(NONCE, NOW + timedelta(minutes=5), NOW)
    assert not first.consume(NONCE, NOW + timedelta(minutes=5), NOW)
    assert not SqliteNonceReplayStore(str(path)).consume(
        NONCE, NOW + timedelta(minutes=5), NOW
    )


def test_concurrent_consume_has_exactly_one_success(tmp_path: Path) -> None:
    store = SqliteNonceReplayStore(str(tmp_path / "nonces.sqlite3"))

    with ThreadPoolExecutor(max_workers=12) as executor:
        outcomes = list(
            executor.map(
                lambda _: store.consume(NONCE, NOW + timedelta(minutes=5), NOW),
                range(12),
            )
        )

    assert outcomes.count(True) == 1
    assert outcomes.count(False) == 11


def test_expiry_pruning_and_fixed_capacity_are_fail_closed(tmp_path: Path) -> None:
    path = tmp_path / "nonces.sqlite3"
    store = SqliteNonceReplayStore(str(path), max_entries=2)
    nonce_two = "22222222-2222-4222-8222-222222222222"
    nonce_three = "33333333-3333-4333-8333-333333333333"

    assert store.consume(NONCE, NOW + timedelta(seconds=1), NOW)
    assert store.consume(nonce_two, NOW + timedelta(minutes=5), NOW)
    assert store.consume(nonce_three, NOW + timedelta(minutes=5), NOW + timedelta(seconds=2))
    with pytest.raises(ReplayStoreUnavailable):
        store.consume(
            "44444444-4444-4444-8444-444444444444",
            NOW + timedelta(minutes=5),
            NOW + timedelta(seconds=2),
        )


def test_database_contains_only_nonce_hash_and_expiry(tmp_path: Path) -> None:
    path = tmp_path / "nonces.sqlite3"
    store = SqliteNonceReplayStore(str(path))
    assert store.consume(NONCE, NOW + timedelta(minutes=5), NOW)

    with sqlite3.connect(path) as connection:
        columns = [
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(ingestion_nonce_replays)"
            ).fetchall()
        ]
        row = connection.execute(
            "SELECT nonce_hash, expires_at FROM ingestion_nonce_replays"
        ).fetchone()

    assert columns == ["nonce_hash", "expires_at"]
    assert row == (sha256(NONCE.encode("ascii")).hexdigest(), int((NOW + timedelta(minutes=5)).timestamp()))
    assert NONCE.encode() not in path.read_bytes()


def test_locked_corrupt_unwritable_and_wrong_schema_stores_fail(tmp_path: Path) -> None:
    locked_path = tmp_path / "locked.sqlite3"
    locked_store = SqliteNonceReplayStore(str(locked_path))
    lock = sqlite3.connect(locked_path, isolation_level=None)
    lock.execute("BEGIN EXCLUSIVE")
    try:
        with pytest.raises(ReplayStoreUnavailable):
            locked_store.consume(NONCE, NOW + timedelta(minutes=5), NOW)
    finally:
        lock.execute("ROLLBACK")
        lock.close()

    corrupt_path = tmp_path / "corrupt.sqlite3"
    corrupt_path.write_bytes(b"not-a-sqlite-database")
    with pytest.raises(ReplayStoreUnavailable):
        SqliteNonceReplayStore(str(corrupt_path))

    schema_path = tmp_path / "wrong-schema.sqlite3"
    with sqlite3.connect(schema_path) as connection:
        connection.execute(
            "CREATE TABLE ingestion_nonce_replays (nonce_hash TEXT PRIMARY KEY, expires_at TEXT, tenant_id TEXT)"
        )
    with pytest.raises(ReplayStoreUnavailable):
        SqliteNonceReplayStore(str(schema_path))

    missing_parent = tmp_path / "missing" / "nonces.sqlite3"
    with pytest.raises(ReplayStoreUnavailable):
        SqliteNonceReplayStore(str(missing_parent))

    unwritable = tmp_path / "unwritable"
    unwritable.mkdir()
    original_mode = unwritable.stat().st_mode
    unwritable.chmod(0o500)
    try:
        with pytest.raises(ReplayStoreUnavailable):
            SqliteNonceReplayStore(str(unwritable / "nonces.sqlite3"))
    finally:
        os.chmod(unwritable, original_mode)


@pytest.mark.parametrize("path", ["relative.sqlite3", "", "\x00.sqlite3"])
def test_invalid_paths_fail(path: str) -> None:
    with pytest.raises(ReplayStoreUnavailable):
        SqliteNonceReplayStore(path)
