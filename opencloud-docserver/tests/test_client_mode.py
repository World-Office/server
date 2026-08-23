"""Tests for OCIS client mode: editor sessions + remote WOPI client.

We stand up a tiny mock WOPI host (FastAPI) that simulates OCIS, then
run the docserver against it through the editor API.
"""

from __future__ import annotations

import io
import threading
from wsgiref.simple_server import make_server

from src.editor.session import RemoteWopiClient, SessionRegistry, session_from_token
from src.lib.crypto import encode_token

SECRET = "0123456789abcdef0123456789abcdef"

# ----------------------------------------------------------------------
# Unittest-style mock WOPI host (no FastAPI TestClient, real HTTP loop)
# ----------------------------------------------------------------------



class _MockHost:
    """A bare WSGI host that speaks enough WOPI for tests."""

    def __init__(self) -> None:
        self.content: bytes | None = None
        self.auth_seen: list[str] = []
        self.query_seen: list[str] = []
        self.override_seen: list[str] = []
        self.lock_token: str | None = None

    def __call__(self, environ, start_response):
        token = environ.get("HTTP_AUTHORIZATION", "")
        if token:
            self.auth_seen.append(token)
        q = environ.get("QUERY_STRING", "")
        if q:
            self.query_seen.append(q)
        override = environ.get("HTTP_X_WOPI_OVERRIDE", "")
        if override:
            self.override_seen.append(override)

        path = environ.get("PATH_INFO", "")
        method = environ.get("REQUEST_METHOD", "GET")

        if path == "/wopi/files/doc1/contents" and method == "GET":
            start_response("200 OK", [("Content-Type", "application/octet-stream")])
            return [self.content or b""]
        if path == "/wopi/files/doc1/contents" and method == "POST" and override == "PUT":
            length = int(environ.get("CONTENT_LENGTH", "0"))
            lock_hdr = environ.get("HTTP_X_WOPI_LOCK", "")
            if lock_hdr != (self.lock_token or ""):
                # wopiserver behaviour: unlocked file -> 409, mismatched -> 500
                if not self.lock_token:
                    start_response(
                        "409 Conflict", [("Content-Type", "text/plain"), ("X-WOPI-Lock", ""), ("X-WOPI-LockFailureReason", "Cannot PutFile on unlocked file")]
                    )
                    return [b"conflict"]
                start_response("500 Internal Server Error", [("Content-Type", "text/plain")])
                return [b"lock mismatch"]
            self.content = environ["wsgi.input"].read(length)
            start_response("200 OK", [("Content-Type", "application/json")])
            return [b"{}"]
        if path == "/wopi/files/doc1" and method == "POST" and override == "LOCK":
            tok = environ.get("HTTP_X_WOPI_LOCK", "")
            if self.lock_token and self.lock_token != tok:
                start_response("409 Conflict", [("Content-Type", "text/plain"), ("X-WOPI-Lock", self.lock_token)])
                return [b"locked by other"]
            self.lock_token = tok
            start_response("200 OK", [("Content-Type", "application/json"), ("X-WOPI-ItemVersion", "v1")])
            return [b"{}"]
        if path == "/wopi/files/doc1" and method == "POST" and override == "GET_LOCK":
            start_response("200 OK", [("Content-Type", "application/json"), ("X-WOPI-Lock", self.lock_token or "")])
            return [b"{}"]
        if path == "/wopi/files/doc1" and method == "POST" and override == "UNLOCK":
            if environ.get("HTTP_X_WOPI_LOCK", "") == self.lock_token:
                self.lock_token = None
            start_response("200 OK", [("Content-Type", "application/json")])
            return [b"{}"]
        if path == "/wopi/files/doc1" and method == "GET":
            start_response(
                "200 OK",
                [("Content-Type", "application/json")],
            )
            return [b'{"BaseFileName":"remote.docx"}']
        start_response("404 Not Found", [("Content-Type", "text/plain")])
        return [b"not found"]


class _RealWopiClientTest:
    """Run one WSGI host on a thread and test RemoteWopiClient against it."""

    def __enter__(self):
        host = _MockHost()
        httpd = make_server("127.0.0.1", 0, host)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        client = RemoteWopiClient(f"http://127.0.0.1:{port}", "token-123")
        client_wrapped = type("W", (), {})()
        client_wrapped.httpd = httpd
        client_wrapped.thread = thread
        client_wrapped.host = host
        client_wrapped.client = client
        self._obj = client_wrapped
        return client_wrapped

    def __exit__(self, *exc):
        self._obj.httpd.shutdown()
        self._obj.httpd.server_close()
        self._obj.thread.join(timeout=2)
        return False


def test_remote_client_get_and_put():
    with _RealWopiClientTest() as env:
        env.client.put_contents("doc1", b"hello from editor")
        assert env.host.content == b"hello from editor"
        got = env.client.get_contents("doc1")
        assert got == b"hello from editor"
        # WOPI hosts receive the access token as a query parameter.
        assert any("access_token=token-123" in q for q in env.host.query_seen)
        # OpenCloud/OCIS wopiserver expects PUT on /wopi/files/{id}/contents
        # with the X-WOPI-Override: PUT header.
        assert "PUT" in env.host.override_seen


def test_remote_client_sends_lock_on_put():
    with _RealWopiClientTest() as env:
        lock = env.client.acquire_or_adopt_lock("doc1")
        env.client.put_contents("doc1", b"x")
        assert env.host.content == b"x"
        assert env.host.override_seen.count("PUT") >= 1
        assert env.host.override_seen.count("LOCK") >= 1
        assert env.host.lock_token == lock


# ----------------------------------------------------------------------
# Session decoded from OCIS JWT
# ----------------------------------------------------------------------

def test_session_from_token():
    token = encode_token(
        SECRET,
        {"file_id": "doc1", "file_name": "r.docx", "user_id": "alice"},
        ttl=60,
    )
    s = session_from_token(token, SECRET)
    assert s is not None
    assert s.doc_id == "doc1"
    assert s.user_id == "alice"


def test_session_from_bad_token_returns_none():
    assert session_from_token("garbage", SECRET) is None
    assert session_from_token("", SECRET) is None


def test_session_registry():
    reg = SessionRegistry()
    assert reg.get("doc1") is None
    s = session_from_token(encode_token(SECRET, {"file_id": "doc1"}, ttl=60), SECRET)
    reg.register(s)
    assert reg.get("doc1") is s
    reg.drop("doc1")
    assert reg.get("doc1") is None


def test_remote_client_acquire_lock_and_put():
    """Client-mode save path: lock first, then PutFile with the lock (the
    wopiserver refuses PutFile on unlocked files)."""
    with _RealWopiClientTest() as env:
        lock = env.client.acquire_or_adopt_lock("doc1")
        assert lock and env.host.lock_token == lock
        env.client.put_contents("doc1", b"locked write")
        assert env.host.content == b"locked write"
        env.client.release_lock("doc1")
        assert env.host.lock_token is None


def test_remote_client_adopts_existing_lock():
    with _RealWopiClientTest() as env:
        other = env.client.acquire_or_adopt_lock("doc1")  # first holds lock
        env2 = RemoteWopiClient(env.client.host, "token-456")
        adopted = env2.acquire_or_adopt_lock("doc1")  # LOCK fails -> adopt
        assert adopted == other
        assert env2.lock_token == other
        env2.put_contents("doc1", b"adopted write")  # save succeeds with adopted lock
        assert env.host.content == b"adopted write"
        env2.release_lock("doc1")
        assert env.host.lock_token is None


def test_editor_save_uses_session_lock_in_client_mode(tmp_path):
    """Regression: the client-mode save path must carry the session's WOPI
    lock to the remote PutFile (otherwise the wopiserver answers 409
    \"Cannot PutFile on unlocked file\")."""
    import threading
    from contextlib import asynccontextmanager
    from wsgiref.simple_server import make_server

    from docx import Document
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from src.config import Config
    from src.editor.router import router as editor_router
    from src.lib.store import DocumentStore, wipe_db, wipe_dir
    from src.wopi.router import router as wopi_router

    seed = Document()
    seed.add_paragraph("hello remote")
    buf = io.BytesIO()
    seed.save(buf)

    host = _MockHost()
    httpd = make_server("127.0.0.1", 0, host)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        host.content = buf.getvalue()
        db = str(tmp_path / "t.db")
        content = str(tmp_path / "content")
        store = DocumentStore(db, content)
        cfg = Config(database=db, content_dir=content, jwt_secret="test-secret")

        @asynccontextmanager
        async def lifespan(app):
            app.state.store = store
            app.state.sessions = SessionRegistry()
            app.state.config = cfg
            yield

        app = FastAPI(lifespan=lifespan)
        app.include_router(wopi_router)
        app.include_router(editor_router)
        with TestClient(app) as c:
            resp = c.post(
                "/editor",
                data={"access_token": "tok-1"},
                params={"WOPISrc": f"http://127.0.0.1:{port}/wopi/files/doc1"},
            )
            assert resp.status_code == 200
            assert host.lock_token, "launch must take the WOPI lock on the remote host"

            r = c.get("/api/documents/doc1/html")
            assert r.status_code == 200, r.text

            r = c.post("/api/documents/doc1/save", json={"html": "<p>saved via lock</p>"})
            assert r.status_code == 200, r.text
            saved = Document(io.BytesIO(host.content))
            assert "saved via lock" in "\n".join(p.text for p in saved.paragraphs)
    finally:
        httpd.shutdown()
        httpd.server_close()
        thread.join(timeout=2)
        wipe_db(str(tmp_path / "t.db"))
        wipe_dir(str(tmp_path / "content"))
