"""Bounded durable one-use nonce storage for the single-worker production profile."""

from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import re
import sqlite3

_NONCE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
_SCHEMA_VERSION = 1
DEFAULT_MAX_ENTRIES = 4096


class ReplayStoreUnavailable(RuntimeError):
    """The durable replay authority cannot safely make a one-use decision."""


class SqliteNonceReplayStore:
    """Persist only a nonce SHA-256 digest and its UTC expiry."""

    def __init__(self, path: str, *, max_entries: int = DEFAULT_MAX_ENTRIES) -> None:
        self._path = self._validated_path(path)
        if not isinstance(max_entries, int) or isinstance(max_entries, bool) or not 1 <= max_entries <= DEFAULT_MAX_ENTRIES:
            raise ReplayStoreUnavailable()
        self._max_entries = max_entries
        self._initialize()

    @staticmethod
    def _validated_path(value: str) -> Path:
        if not isinstance(value, str) or "\x00" in value:
            raise ReplayStoreUnavailable()
        path = Path(value)
        if not path.is_absolute() or not path.parent.is_dir():
            raise ReplayStoreUnavailable()
        if path.exists() and (path.is_symlink() or not path.is_file()):
            raise ReplayStoreUnavailable()
        return path

    def _connect(self) -> sqlite3.Connection:
        try:
            connection = sqlite3.connect(
                f"{self._path.as_uri()}?mode=rwc",
                uri=True,
                timeout=0.25,
                isolation_level=None,
            )
            connection.execute("PRAGMA busy_timeout = 250")
            connection.execute("PRAGMA foreign_keys = ON")
            return connection
        except (OSError, sqlite3.Error, ValueError) as exc:
            raise ReplayStoreUnavailable() from exc

    def _initialize(self) -> None:
        try:
            with self._connect() as connection:
                connection.execute("PRAGMA journal_mode = WAL")
                connection.execute("PRAGMA synchronous = FULL")
                connection.execute(
                    """
                    CREATE TABLE IF NOT EXISTS ingestion_nonce_replays (
                        nonce_hash TEXT PRIMARY KEY NOT NULL
                            CHECK(length(nonce_hash) = 64)
                            CHECK(nonce_hash NOT GLOB '*[^0-9a-f]*'),
                        expires_at INTEGER NOT NULL CHECK(expires_at > 0)
                    ) WITHOUT ROWID
                    """
                )
                columns = connection.execute(
                    "PRAGMA table_info(ingestion_nonce_replays)"
                ).fetchall()
                if [(row[1], row[2], row[3], row[5]) for row in columns] != [
                    ("nonce_hash", "TEXT", 1, 1),
                    ("expires_at", "INTEGER", 1, 0),
                ]:
                    raise ReplayStoreUnavailable()
                version = connection.execute("PRAGMA user_version").fetchone()
                if version is None or version[0] not in (0, _SCHEMA_VERSION):
                    raise ReplayStoreUnavailable()
                connection.execute(f"PRAGMA user_version = {_SCHEMA_VERSION}")
                connection.execute("BEGIN IMMEDIATE")
                connection.execute("DELETE FROM ingestion_nonce_replays WHERE expires_at <= ?", (int(datetime.now(timezone.utc).timestamp()),))
                count = connection.execute(
                    "SELECT COUNT(*) FROM ingestion_nonce_replays"
                ).fetchone()
                if count is None or count[0] > self._max_entries:
                    raise ReplayStoreUnavailable()
                connection.execute("COMMIT")
            self._path.chmod(0o600)
        except ReplayStoreUnavailable:
            raise
        except (OSError, sqlite3.Error) as exc:
            raise ReplayStoreUnavailable() from exc

    def consume(self, nonce: str, expires_at: datetime, now: datetime) -> bool:
        if (
            not isinstance(nonce, str)
            or _NONCE.fullmatch(nonce) is None
            or expires_at.tzinfo is None
            or now.tzinfo is None
        ):
            raise ReplayStoreUnavailable()
        normalized_expiry = expires_at.astimezone(timezone.utc)
        normalized_now = now.astimezone(timezone.utc)
        expiry_epoch = int(normalized_expiry.timestamp())
        now_epoch = int(normalized_now.timestamp())
        if expiry_epoch <= now_epoch:
            raise ReplayStoreUnavailable()
        nonce_hash = sha256(nonce.encode("ascii")).hexdigest()

        connection: sqlite3.Connection | None = None
        try:
            connection = self._connect()
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM ingestion_nonce_replays WHERE expires_at <= ?",
                (now_epoch,),
            )
            count = connection.execute(
                "SELECT COUNT(*) FROM ingestion_nonce_replays"
            ).fetchone()
            if count is None:
                raise ReplayStoreUnavailable()
            existing = connection.execute(
                "SELECT 1 FROM ingestion_nonce_replays WHERE nonce_hash = ?",
                (nonce_hash,),
            ).fetchone()
            if existing is not None:
                connection.execute("ROLLBACK")
                return False
            if count[0] >= self._max_entries:
                raise ReplayStoreUnavailable()
            cursor = connection.execute(
                "INSERT INTO ingestion_nonce_replays (nonce_hash, expires_at) VALUES (?, ?)",
                (nonce_hash, expiry_epoch),
            )
            if cursor.rowcount != 1:
                raise ReplayStoreUnavailable()
            connection.execute("COMMIT")
            return True
        except ReplayStoreUnavailable:
            if connection is not None and connection.in_transaction:
                connection.execute("ROLLBACK")
            raise
        except (OSError, sqlite3.Error) as exc:
            if connection is not None and connection.in_transaction:
                try:
                    connection.execute("ROLLBACK")
                except sqlite3.Error:
                    pass
            raise ReplayStoreUnavailable() from exc
        finally:
            if connection is not None:
                connection.close()
