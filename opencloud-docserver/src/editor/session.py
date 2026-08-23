"""Editor session: bridges the local docserver with a remote WOPI host.

When OCIS launches our editor it passes an `access_token` (WopiContext
JWT). In that case the docserver becomes a WOPI **client**: it fetches
file bytes from the remote WOPI host (`{wopi_host}/wopi/files/{id}/...`)
using the given token, converts locally for editing, and forwards the
saved bytes back to the remote host with the token.

When no `wopi_host` is configured the docserver is a self-contained WOPI
**host** and all content lives in the local SQLite store.
"""

from __future__ import annotations

import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

from ..lib.crypto import decode_token


@dataclass
class EditorSession:
    """Immutable description of an active editing session."""

    doc_id: str
    name: str
    size: int
    version: str
    last_modified: int
    owner_id: str = "unknown"
    user_id: str = "anonymous"
    user_name: str = "Anonymous"
    remote_host: str | None = None
    access_token: str | None = None
    lock_token: str = ""
    created_at: float = field(default_factory=time.time)

    @property
    def in_client_mode(self) -> bool:
        """True when we are forwarding to a remote WOPI host (OCIS)."""
        return bool(self.remote_host and self.access_token)


class RemoteWopiClient:
    """Minimal HTTP client for a remote WOPI host (OCIS)."""

    def __init__(self, host: str, access_token: str, timeout: float = 30.0) -> None:
        self.host = host.rstrip("/")
        self.access_token = access_token
        self.timeout = timeout
        self.lock_token = ""

    def _url(self, doc_id: str, action: str = "") -> str:
        base = f"{self.host}/wopi/files/{urllib.parse.quote(doc_id)}"
        if action:
            base += f"/{action}"
        # WOPI hosts expect the access token as a query parameter.
        sep = "?" if "?" not in base else "&"
        return f"{base}{sep}access_token={urllib.parse.quote(self.access_token, safe='')}"

    def get_contents(self, doc_id: str) -> bytes:
        """GET the raw file bytes from the remote host."""
        req = urllib.request.Request(self._url(doc_id, "contents"))
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return resp.read()

    def put_contents(self, doc_id: str, data: bytes) -> None:
        """POST new bytes back to the remote host (respecting our lock token).

        OpenCloud/OCIS wopiserver requires the `X-WOPI-Override: PUT`
        header on the `POST /wopi/files/{id}/contents` endpoint. The bare
        `POST /wopi/files/{id}` form (no `/contents`) returns HTTP 500 on
        OpenCloud 7.3.0, so we must include the `/contents` segment.
        """
        req = urllib.request.Request(
            self._url(doc_id, "contents"), data=data, method="POST"
        )
        req.add_header("Content-Type", "application/octet-stream")
        req.add_header("X-WOPI-Override", "PUT")
        if self.lock_token:
            req.add_header("X-WOPI-Lock", self.lock_token)
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            resp.read()

    def acquire_or_adopt_lock(self, doc_id: str) -> str:
        """Lock the remote file, or adopt the current lock if one exists.

        OpenCloud/OCIS wopiserver refuses PutFile on an unlocked file
        (409 "Cannot PutFile on unlocked file"), so the docserver must take
        the WOPI lock at launch and present `X-WOPI-Lock` on every save.
        If another session already holds the lock (e.g. re-open), adopt it
        via GET_LOCK so saves still succeed. Returns the lock token ("" if
        the host has no locking).
        """
        import uuid

        lock_token = uuid.uuid4().hex
        req = urllib.request.Request(self._url(doc_id), data=b"", method="POST")
        req.add_header("X-WOPI-Override", "LOCK")
        req.add_header("X-WOPI-Lock", lock_token)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                resp.read()
            self.lock_token = lock_token
            return lock_token
        except urllib.error.HTTPError:
            # Already locked elsewhere — adopt the existing lock.
            try:
                req2 = urllib.request.Request(self._url(doc_id), data=b"", method="POST")
                req2.add_header("X-WOPI-Override", "GET_LOCK")
                with urllib.request.urlopen(req2, timeout=self.timeout) as resp:
                    current = resp.headers.get("X-WOPI-Lock", "")
                self.lock_token = current
                return current
            except Exception:
                self.lock_token = ""
                return ""

    def release_lock(self, doc_id: str) -> None:
        """Release the WOPI lock on the remote host (best effort)."""
        if not self.lock_token:
            return
        try:
            req = urllib.request.Request(self._url(doc_id), data=b"", method="POST")
            req.add_header("X-WOPI-Override", "UNLOCK")
            req.add_header("X-WOPI-Lock", self.lock_token)
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                resp.read()
        except Exception:
            pass
        self.lock_token = ""

    def check_file_info(self, doc_id: str) -> dict:
        """GET CheckFileInfo from the remote host."""
        req = urllib.request.Request(self._url(doc_id))
        req.add_header("Authorization", f"Bearer {self.access_token}")
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return _json(resp)


def _json(resp) -> dict:
    import json

    return json.loads(resp.read().decode("utf-8"))


class SessionRegistry:
    """In-memory registry of active editor sessions (ephemeral by design)."""

    def __init__(self) -> None:
        self._sessions: dict[str, EditorSession] = {}

    def register(self, session: EditorSession) -> None:
        self._sessions[session.doc_id] = session

    def get(self, doc_id: str) -> EditorSession | None:
        return self._sessions.get(doc_id)

    def drop(self, doc_id: str) -> None:
        self._sessions.pop(doc_id, None)

    def all(self) -> list[EditorSession]:
        return sorted(self._sessions.values(), key=lambda s: s.created_at)


def session_from_token(token: str, secret: str) -> EditorSession | None:
    """Create an EditorSession from a signed WOPI token (client mode).

    Returns None when the token is absent/invalid — the caller then falls
    back to local host mode.
    """
    if not token:
        return None
    try:
        claims = decode_token(secret, token)
    except Exception:
        return None
    return EditorSession(
        doc_id=claims.get("file_id") or claims.get("sub") or "",
        name=claims.get("file_name", "document.docx"),
        size=int(claims.get("file_size", 0)),
        version=claims.get("version", "1"),
        last_modified=int(claims.get("iat", time.time())),
        owner_id=claims.get("user_id", "unknown"),
        user_id=claims.get("user_id", "anonymous"),
        user_name=claims.get("user_name", "Anonymous"),
    )
