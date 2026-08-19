"""Tests for WOPI host endpoints and editor API (integration style)."""

from __future__ import annotations

import io
from contextlib import asynccontextmanager

import pytest
from docx import Document
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.config import Config
from src.editor.router import router as editor_router
from src.editor.session import SessionRegistry
from src.lib.store import DocumentStore, wipe_db, wipe_dir
from src.wopi.router import router as wopi_router


def _make_app(tmp_path) -> tuple[FastAPI, DocumentStore]:
    db = str(tmp_path / "t.db")
    content = str(tmp_path / "content")
    store = DocumentStore(db, content)
    cfg = Config(database=db, content_dir=content, jwt_secret="test-secret")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.store = store
        app.state.sessions = SessionRegistry()
        app.state.config = cfg
        yield

    app = FastAPI(lifespan=lifespan)
    app.include_router(wopi_router)
    app.include_router(editor_router)
    return app, store


def _docx_bytes(text: str = "Test body") -> bytes:
    doc = Document()
    doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


@pytest.fixture
def client(tmp_path):
    app, store = _make_app(tmp_path)
    with TestClient(app) as c:
        c.test_store = store  # type: ignore[attr-defined]
        yield c
    wipe_db(tmp_path / "t.db")
    wipe_dir(tmp_path / "content")


def _seed_doc(client, doc_id="doc1", name="hello.docx", data=None):
    store = client.test_store  # type: ignore[attr-defined]
    store.init(doc_id, name)
    store.put_content(doc_id, data or _docx_bytes())
    return doc_id


# ----------------------------------------------------------------------
# WOPI host endpoints
# ----------------------------------------------------------------------

def test_check_file_info(client):
    _seed_doc(client)
    res = client.get("/wopi/files/doc1")
    assert res.status_code == 200
    body = res.json()
    assert body["BaseFileName"] == "hello.docx"
    assert body["SupportsLocks"] is True


def test_check_file_info_missing(client):
    res = client.get("/wopi/files/ghost")
    assert res.status_code == 404


def test_get_file(client):
    data = _docx_bytes()
    _seed_doc(client, data=data)
    res = client.get("/wopi/files/doc1/contents")
    assert res.status_code == 200
    assert res.content == data
    assert "X-WOPI-ItemVersion" in res.headers


def test_put_file(client):
    _seed_doc(client)
    new_data = _docx_bytes("Updated content")
    res = client.post("/wopi/files/doc1/contents", content=new_data)
    assert res.status_code == 200
    assert client.test_store.get_content("doc1") == new_data  # type: ignore[attr-defined]


def test_put_file_respects_lock(client):
    store = client.test_store  # type: ignore[attr-defined]
    _seed_doc(client)
    store.set_lock("doc1", "LOCK-123", "alice")

    # wrong lock -> 409
    res = client.post(
        "/wopi/files/doc1/contents",
        content=b"x",
        headers={"X-WOPI-Lock": "WRONG"},
    )
    assert res.status_code == 409

    # correct lock -> 200
    res = client.post(
        "/wopi/files/doc1/contents",
        content=b"y",
        headers={"X-WOPI-Lock": "LOCK-123"},
    )
    assert res.status_code == 200


def test_lock_unlock_cycle(client):
    _seed_doc(client)
    res = client.post("/wopi/files/doc1/lock", headers={"X-WOPI-Lock": "L1"})
    assert res.status_code == 200
    assert client.test_store.get_lock("doc1") == "L1"  # type: ignore[attr-defined]

    # unlock with wrong token -> 409
    res = client.post("/wopi/files/doc1/unlock", headers={"X-WOPI-Lock": "BAD"})
    assert res.status_code == 409

    # unlock with right token -> 200
    res = client.post("/wopi/files/doc1/unlock", headers={"X-WOPI-Lock": "L1"})
    assert res.status_code == 200
    assert client.test_store.get_lock("doc1") == ""  # type: ignore[attr-defined]

    # getlock returns current token
    res = client.post("/wopi/files/doc1/getlock")
    assert res.status_code == 200


def test_refresh_lock(client):
    store = client.test_store  # type: ignore[attr-defined]
    _seed_doc(client)
    store.set_lock("doc1", "L1", "bob")
    res = client.post("/wopi/files/doc1/refreshlock", headers={"X-WOPI-Lock": "L1"})
    assert res.status_code == 200


# ----------------------------------------------------------------------
# Editor API
# ----------------------------------------------------------------------

def test_upload_then_html(client):
    res = client.post(
        "/api/upload",
        files={"file": ("myfile.docx", _docx_bytes("Uploaded body"), "application/octet-stream")},
    )
    assert res.status_code == 200
    doc_id = res.json()["id"]

    res = client.get(f"/api/documents/{doc_id}/html")
    assert res.status_code == 200
    assert "Uploaded body" in res.json()["html"]


def test_save_document(client):
    _seed_doc(client)
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": "<p>Typed in the editor</p>"},
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True

    # content is now a valid docx containing the new text
    docx_bytes = client.test_store.get_content("doc1")  # type: ignore[attr-defined]
    doc = Document(io.BytesIO(docx_bytes))
    assert "Typed in the editor" in "\n".join(p.text for p in doc.paragraphs)


def test_save_invalid_json(client):
    _seed_doc(client)
    res = client.post("/api/documents/doc1/save", content=b"not json", headers={"Content-Type": "application/json"})
    assert res.status_code == 400


def test_document_list(client):
    _seed_doc(client, doc_id="a", name="a.docx")
    _seed_doc(client, doc_id="b", name="b.docx")
    res = client.get("/api/documents")
    assert res.status_code == 200
    ids = {d["id"] for d in res.json()}
    assert ids == {"a", "b"}


def test_editor_page_served(client):
    _seed_doc(client)
    res = client.get("/editor/doc1")
    assert res.status_code == 200
    assert "contenteditable" in res.text
