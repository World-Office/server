"""Tests for WOPI host endpoints and editor API (integration style)."""

from __future__ import annotations

import io
from contextlib import asynccontextmanager

import pytest
from docx import Document
from fastapi import FastAPI
from fastapi.testclient import TestClient
from odf.opendocument import load

from src.config import Config
from src.editor.odt_converter import html_to_odt
from src.editor.router import router as editor_router
from src.editor.sanitize import sanitize_html
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


def test_hosting_discovery_clean_urlsrc_no_access_token(client):
    """Validated against real OpenCloud 7.3.0: OpenCloud appends WOPISrc to
    the urlsrc itself and POSTs a form with the real access_token in the
    body. urlsrc must therefore contain NO access_token placeholder/param."""
    r = client.get("/hosting/discovery")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/xml")
    xml = r.text
    assert "access_token" not in xml, "urlsrc must not carry an access_token param"
    assert 'urlsrc="http://localhost:8000/editor"' in xml
    assert 'ext="docx"' in xml


def test_hosting_discovery_includes_odt_actions(client):
    """WOPI discovery must advertise ODT view/edit actions."""
    r = client.get("/hosting/discovery")
    assert r.status_code == 200
    xml = r.text
    assert 'ext="odt"' in xml
    assert 'action name="view" ext="odt"' in xml
    assert 'action name="edit" ext="odt"' in xml


def test_odt_file_routes_to_odt_converter(client):
    """Files with .odt extension must use the ODT converter."""
    store = client.test_store  # type: ignore[attr-defined]
    store.init("odt-1", "document.odt")
    odt_bytes = html_to_odt("<p>Hello ODT</p>")
    store.put_content("odt-1", odt_bytes)

    # GET /html should convert ODT -> HTML
    r = client.get("/api/documents/odt-1/html")
    assert r.status_code == 200
    assert "Hello ODT" in r.json()["html"]

    # SAVE should convert HTML -> ODT
    res = client.post(
        "/api/documents/odt-1/save",
        json={"html": "<p>Updated ODT</p>"},
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True

    # Verify the stored bytes are a valid ODT
    stored = store.get_content("odt-1")  # type: ignore[attr-defined]
    doc = load(io.BytesIO(stored))
    from odf import teletype
    text = teletype.extractText(doc.text)
    assert "Updated ODT" in text


def test_editor_launch_accepts_ocis_form_post(client):
    """OpenCloud launches the app by POSTing an urlencoded form with the real
    access_token in the body and WOPISrc in the query string (WOPI handshake)."""
    resp = client.post(
        "/editor",
        data={"access_token": "tok-123", "file_id": "doc-client", "embedded": "true"},
        params={"WOPISrc": "http://collaboration:9300/wopi/files/abc123"},
    )
    assert resp.status_code == 200
    # form `file_id` takes precedence as the session id
    session = client.app.state.sessions.get("doc-client")
    assert session is not None, "client-mode session must be registered from POST body"
    assert session.remote_host == "http://collaboration:9300"
    assert session.access_token == "tok-123"
    # Editor page must be wired to the resolved doc id (root path has no id):
    assert '"doc-client"' in resp.text


def test_editor_launch_get_uses_wopisrc_doc_id(client):
    """GET launches (dev/local) carry everything in the query string; the
    doc id is derived from the last segment of WOPISrc."""
    resp = client.get("/editor", params={
        "access_token": "tok-9",
        "WOPISrc": "http://collaboration:9300/wopi/files/fid-77",
    })
    assert resp.status_code == 200
    session = client.app.state.sessions.get("fid-77")
    assert session is not None
    assert session.access_token == "tok-9"
    assert session.remote_host == "http://collaboration:9300"
    assert '"fid-77"' in resp.text


def test_document_html_empty_file_returns_blank(client):
    """A 0-byte file must open as a blank document (start-typing UX), not
    fail with 'File is not a zip file' (US-3)."""
    store = client.test_store  # type: ignore[attr-defined]
    store.init("e1", "empty.docx")
    store.put_content("e1", b"")
    r = client.get("/api/documents/e1/html")
    assert r.status_code == 200
    body = r.json()
    assert body["html"] == ""
    assert body["blank"] is True


def test_document_html_corrupt_nonempty_still_errors(client):
    store = client.test_store  # type: ignore[attr-defined]
    store.init("e2", "corrupt.docx")
    store.put_content("e2", b"this is not a zip file, just text bytes")
    r = client.get("/api/documents/e2/html")
    assert r.status_code == 500


# ----------------------------------------------------------------------
# XSS sanitizer
# ----------------------------------------------------------------------

def test_save_document_sanitizes_script_tag(client):
    """Script tags must be stripped before storage."""
    _seed_doc(client)
    malicious = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True

    docx_bytes = client.test_store.get_content("doc1")  # type: ignore[attr-defined]
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    # The script tag and its content should be removed
    assert "<script>" not in text
    assert "alert" not in text
    # Safe content should remain
    assert "Hello" in text
    assert "World" in text


def test_save_document_sanitizes_event_handler_attributes(client):
    """Event handler attributes (onclick, onerror, etc.) must be stripped."""
    _seed_doc(client)
    malicious = '<p onclick="alert(1)">Click me</p><img src="x" onerror="alert(1)">'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")  # type: ignore[attr-defined]
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "onclick" not in text
    assert "onerror" not in text
    assert "Click me" in text


def test_save_document_sanitizes_iframe(client):
    """iframe elements must be stripped (potential XSS vector)."""
    _seed_doc(client)
    malicious = '<p>Safe content</p><iframe src="https://evil.com"></iframe><p>More safe</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")  # type: ignore[attr-defined]
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "iframe" not in text
    assert "Safe content" in text
    assert "More safe" in text


def test_save_document_sanitizes_style_with_url(client):
    """Style attributes with url() or data: URIs must be stripped."""
    _seed_doc(client)
    malicious = '<p style="background-image:url(\'javascript:alert(1)\')">Test</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")  # type: ignore[attr-defined]
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    # The style with dangerous content should be removed
    assert "alert" not in text
    assert "Test" in text


def test_save_document_sanitizes_empty_string(client):
    """Empty string input should return empty HTML."""
    _seed_doc(client)
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": ""},
    )
    assert res.status_code == 200


def test_save_document_preserves_safe_formatting(client):
    """Safe formatting (bold, italic, underline, headings) should be preserved."""
    _seed_doc(client)
    formatted = "<h1>Heading</h1><p><b>Bold</b> and <i>italic</i> and <u>underline</u></p>"
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": formatted},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")  # type: ignore[attr-defined]
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "Heading" in text
    assert "Bold" in text
    assert "italic" in text
    assert "underline" in text


def test_save_document_sanitizes_nested_script(client):
    """Nested script tags with mixed case must be stripped."""
    _seed_doc(client)
    malicious = '<p>Safe</p><SCRIPT>alert(1)</SCRIPT><p>Also safe</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")  # type: ignore[attr-defined]
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "<script>" not in text.lower() or "SCRIPT" not in text
    assert "alert" not in text
    assert "Safe" in text
    assert "Also safe" in text


# ----------------------------------------------------------------------
# XSS Evasion Tests (US-44)
# ----------------------------------------------------------------------

def test_save_document_sanitizes_html_encoded_script(client):
    """HTML-encoded script tags must be stripped (&#60;script&#62;)."""
    _seed_doc(client)
    # HTML entity encoded script tag
    malicious = '<p>Safe</p>&#60;script&#62;alert(1)&#60;/script&#62;<p>End</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "alert" not in text
    assert "Safe" in text
    assert "End" in text


def test_save_document_sanitizes_hex_encoded_script(client):
    """Hex-encoded script tags must be stripped (&#x3c;script&#x3e;)."""
    _seed_doc(client)
    # Hex entity encoded script tag
    malicious = '<p>Safe</p>&#x3c;script&#x3e;alert(1)&#x3c;/script&#x3e;<p>End</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "alert" not in text
    assert "Safe" in text


def test_save_document_sanitizes_mixed_case_script(client):
    """Mixed case script tags (ScRiPt) must be stripped."""
    _seed_doc(client)
    malicious = '<p>Safe</p><ScRiPt>alert(1)</sCrIpT><p>End</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "alert" not in text.lower()
    assert "Safe" in text


def test_save_document_sanitizes_javascript_href(client):
    """javascript: URLs in href must be stripped."""
    _seed_doc(client)
    malicious = '<p><a href="javascript:alert(1)">Click</a></p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "javascript" not in text.lower()
    assert "Click" in text


def test_save_document_sanitizes_javascript_src(client):
    """javascript: URLs in src must be stripped."""
    _seed_doc(client)
    malicious = '<img src="javascript:alert(1)">'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "javascript" not in text.lower()


def test_save_document_sanitizes_vbscript(client):
    """vbscript: URLs must be stripped."""
    _seed_doc(client)
    malicious = '<img src="vbscript:msgbox(1)">'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "vbscript" not in text.lower()


def test_save_document_sanitizes_css_expression(client):
    """CSS expression() must be stripped (IE legacy)."""
    _seed_doc(client)
    malicious = '<p style="width:expression(alert(1))">Test</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "expression" not in text.lower()
    assert "Test" in text


def test_save_document_sanitizes_css_behavior(client):
    """CSS behavior: must be stripped."""
    _seed_doc(client)
    malicious = '<p style="behavior:url(evil.htc)">Test</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "behavior" not in text.lower()
    assert "Test" in text


def test_save_document_sanitizes_moz_binding(client):
    """-moz-binding: must be stripped."""
    _seed_doc(client)
    malicious = '<p style="-moz-binding:url(evil.xml#xss)">Test</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "moz-binding" not in text.lower()
    assert "Test" in text


def test_save_document_sanitizes_data_uri_style(client):
    """data: URIs in style must be stripped."""
    _seed_doc(client)
    malicious = '<p style="background:url(data:text/html,<script>alert(1)</script>)">Test</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "data:" not in text.lower()
    assert "alert" not in text
    assert "Test" in text


def test_save_document_sanitizes_svg_script(client):
    """SVG with script elements must be stripped."""
    _seed_doc(client)
    malicious = '<p>Safe</p><svg><script>alert(1)</script></svg><p>End</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "alert" not in text
    assert "svg" not in text.lower()
    assert "Safe" in text


def test_save_document_sanitizes_object_embed(client):
    """object and embed tags must be stripped."""
    _seed_doc(client)
    malicious = '<p>Safe</p><object data="evil.swf"></object><embed src="evil.swf"><p>End</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "object" not in text.lower()
    assert "embed" not in text.lower()
    assert "Safe" in text
    assert "End" in text


def test_save_document_sanitizes_base_tag(client):
    """base tag must be stripped (can redirect relative URLs)."""
    _seed_doc(client)
    malicious = '<base href="javascript:alert(1)"><p>Safe</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "base" not in text.lower()
    assert "javascript" not in text.lower()
    assert "Safe" in text


def test_save_document_sanitizes_form_input(client):
    """form and input tags must be stripped (phishing vector)."""
    _seed_doc(client)
    malicious = '<form action="evil.com"><input name="credit"></form>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "form" not in text.lower()
    assert "input" not in text.lower()


def test_save_document_sanitizes_meta_refresh(client):
    """meta refresh tags must be stripped."""
    _seed_doc(client)
    malicious = '<meta http-equiv="refresh" content="0;url=evil.com"><p>Safe</p>'
    res = client.post(
        "/api/documents/doc1/save",
        json={"html": malicious},
    )
    assert res.status_code == 200

    docx_bytes = client.test_store.get_content("doc1")
    doc = Document(io.BytesIO(docx_bytes))
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "meta" not in text.lower()
    assert "refresh" not in text.lower()
    assert "Safe" in text


# ----------------------------------------------------------------------
# Direct sanitizer tests (US-44: functional preservation + evasion)
# Test the sanitizer directly — not through the DOCX pipeline, which
# masks attribute-level bugs (only extracts text).
# ----------------------------------------------------------------------

def test_sanitize_preserves_img_with_data_url():
    """img with data:image src must be preserved (editor image feature)."""
    out = sanitize_html('<img src="data:image/png;base64,AAAA">')
    assert "<img" in out
    assert 'src="data:image/png;base64,AAAA"' in out


def test_sanitize_preserves_a_href_https():
    """a with https href must be preserved."""
    out = sanitize_html('<a href="https://example.com">Link</a>')
    assert "<a" in out
    assert 'href="https://example.com"' in out
    assert "Link" in out


def test_sanitize_preserves_a_href_relative():
    """a with relative href must be preserved."""
    out = sanitize_html('<a href="/doc/123">Link</a>')
    assert 'href="/doc/123"' in out


def test_sanitize_preserves_a_href_mailto():
    """a with mailto: href must be preserved."""
    out = sanitize_html('<a href="mailto:a@b.de">Mail</a>')
    assert "mailto:" in out


def test_sanitize_strips_javascript_href_direct():
    """javascript: href must be removed directly by the sanitizer."""
    out = sanitize_html('<a href="javascript:alert(1)">Click</a>')
    assert "javascript" not in out.lower()


def test_sanitize_strips_javascript_src_direct():
    """javascript: src on img must be removed directly."""
    out = sanitize_html('<img src="javascript:alert(1)">')
    assert "javascript" not in out.lower()


def test_sanitize_strips_mixed_case_javascript_direct():
    """JaVaScRiPt: scheme must be removed (case-insensitive)."""
    out = sanitize_html('<img src="JaVaScRiPt:alert(1)">')
    assert "javascript" not in out.lower()


def test_sanitize_strips_data_text_html_direct():
    """data:text/html src must be removed (only data:image allowed)."""
    out = sanitize_html('<img src="data:text/html,<script>alert(1)</script>">')
    assert "data:text/html" not in out.lower()


def test_sanitize_strips_onerror_direct():
    """onerror attribute must be removed but img kept."""
    out = sanitize_html('<img src="data:image/png;base64,x" onerror="alert(1)">')
    assert "onerror" not in out
    assert "<img" in out


def test_sanitize_strips_vbscript_direct():
    """vbscript: scheme must be removed."""
    out = sanitize_html('<img src="vbscript:msgbox(1)">')
    assert "vbscript" not in out.lower()


def test_sanitize_strips_css_expression_direct():
    """CSS expression() in style must be removed directly."""
    out = sanitize_html('<p style="width:expression(alert(1))">Test</p>')
    assert "expression" not in out.lower()
    assert "Test" in out


def test_sanitize_strips_html_encoded_script_direct():
    """HTML entity encoded script must not survive as a real HTML element."""
    out = sanitize_html("&#60;script&#62;alert(1)&#60;/script&#62;")
    # No real <script> tag may survive as a parseable element
    assert "<script" not in out.lower()
    # The angle brackets must be escaped in the data (round-trip safe)
    assert "&lt;" in out


def test_sanitize_preserves_safe_styles():
    """Safe inline styles (color, font-size) must be preserved."""
    out = sanitize_html('<p style="color:red; font-size:14pt">Text</p>')
    assert "color" in out
    assert "font-size" in out
    assert "Text" in out


def test_sanitize_strips_style_url_direct():
    """url() in style must be removed directly."""
    out = sanitize_html('<p style="background:url(https://evil.com/x.png)">Test</p>')
    assert "url(" not in out.lower()


def test_sanitize_strips_svg_direct():
    """SVG tags must be removed (not in safe list)."""
    out = sanitize_html('<svg><script>alert(1)</script></svg>')
    assert "svg" not in out.lower()
    assert "script" not in out.lower()


def test_sanitize_preserves_formatting():
    """Core formatting must survive: bold, italic, headings, lists."""
    out = sanitize_html('<p><b>Bold</b> <i>Italic</i> <u>Under</u></p><h2>Head</h2><ul><li>Item</li></ul>')
    assert "<b>Bold</b>" in out
    assert "<i>Italic</i>" in out
    assert "<u>Under</u>" in out
    assert "<h2>Head</h2>" in out
    assert "<ul><li>Item</li></ul>" in out


def test_sanitize_strips_base_direct():
    """base tag must be removed directly."""
    out = sanitize_html('<base href="https://evil.com">')
    assert "base" not in out.lower()


def test_sanitize_strips_form_direct():
    """form/input must be removed directly (phishing vector)."""
    out = sanitize_html('<form action="https://evil.com"><input name="x"></form>')
    assert "form" not in out.lower()
    assert "input" not in out.lower()


def test_sanitize_strips_meta_refresh_direct():
    """meta refresh must be removed directly."""
    out = sanitize_html('<meta http-equiv="refresh" content="0;url=https://evil.com">')
    assert "meta" not in out.lower()
