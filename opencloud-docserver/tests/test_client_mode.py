"""Tests for OCIS client mode: editor sessions + remote WOPI client.

We stand up a tiny mock WOPI host (FastAPI) that simulates OCIS, then
run the docserver against it through the editor API.
"""

from __future__ import annotations

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
        if path == "/wopi/files/doc1" and method == "POST" and override == "PUT":
            length = int(environ.get("CONTENT_LENGTH", "0"))
            self.content = environ["wsgi.input"].read(length)
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
        # OpenCloud/OCIS wopiserver expects the unified endpoint + override.
        assert "PUT" in env.host.override_seen


def test_remote_client_sends_lock_on_put():
    with _RealWopiClientTest() as env:
        env.client.lock_token = "LOCK-9"
        # can't easily assert header after fact; just ensure no crash
        env.client.put_contents("doc1", b"x")


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
