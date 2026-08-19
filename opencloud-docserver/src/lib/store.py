"""SQLite document store.

Keeps document metadata, edit locks, and access tokens. Raw document
content is stored in `content_dir` (one file per id) while SQLite holds
the index and lock state — a storeroom ledger, not the warehouse.

Schema (single table `documents`):
    id          TEXT PRIMARY KEY   -- external id supplied by the WOPI host
    name        TEXT NOT NULL      -- base file name including extension
    size        INTEGER DEFAULT 0
    created_at  REAL               -- unix timestamp
    updated_at  REAL
    lock_token  TEXT               -- WOPI lock / "" when unlocked
    lock_user   TEXT               -- display name of the lock owner
"""

from __future__ import annotations

import shutil
import sqlite3
import time
from pathlib import Path
from typing import Any


class DocumentStoreError(RuntimeError):
    """Raised on store-level failures (I/O, DB)."""


class DocumentStore:
    """SQLite-backed metadata index plus file-backed content."""

    def __init__(self, database: str, content_dir: str) -> None:
        self._db_path = Path(database)
        self._content_dir = Path(content_dir)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._content_dir.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._conn:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id         TEXT PRIMARY KEY,
                    name       TEXT NOT NULL,
                    size       INTEGER DEFAULT 0,
                    created_at REAL DEFAULT 0,
                    updated_at REAL DEFAULT 0,
                    lock_token TEXT DEFAULT '',
                    lock_user  TEXT DEFAULT ''
                )
                """
            )

    # ----- lifecycle ----------------------------------------------------

    def init(self, doc_id: str, name: str) -> dict[str, Any]:
        """Register a document in the index (idempotent), return its row."""
        now = time.time()
        with self._conn:
            self._conn.execute(
                "INSERT OR IGNORE INTO documents (id, name, created_at, updated_at) "
                "VALUES (?, ?, ?, ?)",
                (doc_id, name, now, now),
            )
        return self.get(doc_id)

    def get(self, doc_id: str) -> dict[str, Any] | None:
        """Return the metadata row for a document, or None if unknown."""
        row = self._conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
        return dict(row) if row else None

    def list(self) -> list[dict[str, Any]]:
        """Return all registered documents, newest first."""
        rows = self._conn.execute("SELECT * FROM documents ORDER BY updated_at DESC").fetchall()
        return [dict(r) for r in rows]

    def delete(self, doc_id: str) -> bool:
        """Remove a document and its content file. Returns True if removed."""
        with self._conn:
            cur = self._conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        removed = cur.rowcount > 0
        if removed:
            self._delete_content(doc_id)
        return removed

    # ----- content ------------------------------------------------------

    def content_path(self, doc_id: str) -> Path:
        """Filesystem path where a document's bytes live."""
        return self._content_dir / f"{doc_id}.bin"

    def put_content(self, doc_id: str, data: bytes) -> None:
        """Write document bytes and update the size in the index."""
        path = self.content_path(doc_id)
        path.write_bytes(data)
        now = time.time()
        with self._conn:
            self._conn.execute(
                "UPDATE documents SET size = ?, updated_at = ? WHERE id = ?",
                (len(data), now, doc_id),
            )

    def get_content(self, doc_id: str) -> bytes | None:
        """Return document bytes, or None if content is missing."""
        path = self.content_path(doc_id)
        if not path.exists():
            return None
        return path.read_bytes()

    def has_content(self, doc_id: str) -> bool:
        """True if a content file exists for the document."""
        return self.content_path(doc_id).exists()

    def _delete_content(self, doc_id: str) -> None:
        path = self.content_path(doc_id)
        if path.exists():
            path.unlink()

    # ----- locking ------------------------------------------------------

    def get_lock(self, doc_id: str) -> str:
        """Return the current lock token ('' when unlocked)."""
        row = self._conn.execute(
            "SELECT lock_token FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        return row["lock_token"] if row else ""

    def set_lock(self, doc_id: str, token: str, user: str = "") -> None:
        """Acquire/replace the lock on a document."""
        with self._conn:
            self._conn.execute(
                "UPDATE documents SET lock_token = ?, lock_user = ? WHERE id = ?",
                (token, user, doc_id),
            )

    def release_lock(self, doc_id: str) -> None:
        """Clear the lock on a document."""
        with self._conn:
            self._conn.execute(
                "UPDATE documents SET lock_token = '', lock_user = '' WHERE id = ?",
                (doc_id,),
            )


def wipe_db(db_path: str) -> None:
    """Remove the SQLite file (used by tests / reset)."""
    p = Path(db_path)
    if p.exists():
        p.unlink()
    # WAL/shm sidecars
    for suffix in ("-wal", "-shm"):
        side = Path(str(p) + suffix)
        if side.exists():
            side.unlink()


def wipe_dir(path: str) -> None:
    """Remove a content directory tree (used by tests / reset)."""
    p = Path(path)
    if p.exists():
        shutil.rmtree(p)


def ensure_dirs(database: str, content_dir: str) -> None:
    """Create parent directories for db and content files."""
    Path(database).parent.mkdir(parents=True, exist_ok=True)
    Path(content_dir).mkdir(parents=True, exist_ok=True)
