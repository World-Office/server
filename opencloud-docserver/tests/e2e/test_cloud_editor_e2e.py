"""End-to-end cloud editor test (T5).

Drives the REAL editor in a real browser (Playwright/chromium) through a mock
OpenCloud/Nextcloud WOPI host:

  * the editor loads a DOCX from the mock host (client / WOPI mode);
  * TWO browser sessions edit the SAME document and the characters converge
    in real time (server-side character CRDT + poll push);
  * a save forwards the converted bytes back to the mock host (open -> edit
    -> save -> host loop proven in a browser, not just at the API level);
  * the editor notifies its embedding host via postMessage (woopi bridge).

Run: pytest tests/e2e/test_cloud_editor_e2e.py
"""

from __future__ import annotations

import base64
import io
import json
import socket
import threading
import time
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
import uvicorn
from docx import Document
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from src.config import Config
from src.editor.router import router as editor_router
from src.editor.session import SessionRegistry
from src.lib.store import DocumentStore
from src.wopi.testhost import app as mock_host_app
from src.wopi.testhost import reset_store

WEB_DIR = Path(__file__).resolve().parent.parent.parent / "web"


def _docx_bytes(text: str) -> bytes:
    doc = Document()
    doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _make_app(tmp_path: Path) -> FastAPI:
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
    app.include_router(editor_router)
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")
    return app


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


# A trivial host page that embeds the editor in an <iframe> and records every
# postMessage the editor sends upward — this is how OpenCloud/Nextcloud would
# receive the "woopi" bridge messages.
PARENT_HTML = """<!doctype html><html><head><meta charset="utf-8"></head><body>
<iframe id="ed" src="__EDITOR_URL__" style="width:100%;height:600px;border:0"></iframe>
<script>
  window.__msgs = [];
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'woopi') window.__msgs.push(e.data);
  });
</script>
</body></html>"""

parent_app = FastAPI()


@parent_app.get("/")
async def parent_index(request: Request) -> HTMLResponse:
    editor_url = request.query_params.get("editor", "")
    return HTMLResponse(PARENT_HTML.replace("__EDITOR_URL__", editor_url))


@pytest.fixture(scope="module")
def servers(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("e2e")
    doc_port = _free_port()
    host_port = _free_port()
    parent_port = _free_port()

    doc_srv = uvicorn.Server(uvicorn.Config(_make_app(tmp), host="127.0.0.1", port=doc_port, log_level="error"))
    host_srv = uvicorn.Server(uvicorn.Config(mock_host_app, host="127.0.0.1", port=host_port, log_level="error"))
    parent_srv = uvicorn.Server(uvicorn.Config(parent_app, host="127.0.0.1", port=parent_port, log_level="error"))

    for s in (doc_srv, host_srv, parent_srv):
        threading.Thread(target=s.run, daemon=True).start()

    for port in (doc_port, host_port, parent_port):
        deadline = time.time() + 10
        while time.time() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                    break
            except OSError:
                time.sleep(0.05)

    reset_store()
    seed = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                f"http://127.0.0.1:{host_port}/_host/files",
                data=json.dumps(
                    {"name": "e2e.docx", "data": base64.b64encode(_docx_bytes("E2E base text")).decode()}
                ).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            ),
            timeout=10,
        ).read()
    )
    yield {
        "doc_port": doc_port,
        "host_port": host_port,
        "parent_port": parent_port,
        "doc_id": seed["id"],
        "token": seed["access_token"],
    }
    doc_srv.should_exit = True
    host_srv.should_exit = True
    parent_srv.should_exit = True


def _editor_url(servers: dict) -> str:
    wopi_src = f"http://127.0.0.1:{servers['host_port']}/wopi/files/{servers['doc_id']}"
    return (
        f"http://127.0.0.1:{servers['doc_port']}/editor/{servers['doc_id']}"
        f"?access_token={servers['token']}&WOPISrc={urllib.parse.quote(wopi_src, safe='')}"
    )


def _parent_url(servers: dict) -> str:
    return f"http://127.0.0.1:{servers['parent_port']}/?editor={urllib.parse.quote(_editor_url(servers), safe='')}"


def _frame_text(frame) -> str:
    return frame.locator("#editor").inner_text()


def _post_sync(servers: dict, text: str) -> None:
    urllib.request.urlopen(
        urllib.request.Request(
            f"http://127.0.0.1:{servers['doc_port']}/api/documents/{servers['doc_id']}/collab/sync",
            data=json.dumps({"client_id": "probe", "text": text}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        ),
        timeout=10,
    ).read()


def _wait(predicate, timeout: float = 20.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return
        time.sleep(0.3)
    raise AssertionError(f"condition not met within {timeout}s")


def _host_text(servers: dict) -> str:
    url = (
        f"http://127.0.0.1:{servers['host_port']}/wopi/files/{servers['doc_id']}/contents"
        f"?access_token={servers['token']}"
    )
    data = urllib.request.urlopen(url, timeout=10).read()
    return "\n".join(p.text for p in Document(io.BytesIO(data)).paragraphs)


def test_two_users_collaborate_save_and_notify_host(servers):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            ctx_a = browser.new_context()
            ctx_b = browser.new_context()
            parent_a = ctx_a.new_page()
            parent_b = ctx_b.new_page()

            errors = []
            parent_a.on("pageerror", lambda e: errors.append(str(e)))

            parent_a.goto(_parent_url(servers))
            parent_b.goto(_parent_url(servers))

            frame_a = parent_a.frame("ed")
            frame_b = parent_b.frame("ed")
            frame_a.locator("#editor").wait_for(state="visible", timeout=15000)
            frame_b.locator("#editor").wait_for(state="visible", timeout=15000)
            assert "E2E base text" in _frame_text(frame_a)

            # Live push: a hub change converges in BOTH browsers (real-time).
            _post_sync(servers, "LIVEPROBE_X")
            _wait(
                lambda: "LIVEPROBE_X" in _frame_text(frame_a) and "LIVEPROBE_X" in _frame_text(frame_b)
            )

            # Presence: both editors show each other as collaborators (chips),
            # and a remote caret is rendered for the peer.
            assert frame_a.locator("#collab-peers .peer-chip").count() >= 2
            assert frame_b.locator("#collab-peers .peer-chip").count() >= 2
            assert frame_a.locator(".remote-caret").count() >= 1

            # User A types -> User B converges.
            frame_a.locator("#editor").click()
            frame_a.locator("#editor").press("End")
            frame_a.locator("#editor").press_sequentially(" from A")
            _wait(lambda: "from A" in _frame_text(frame_a))
            _wait(lambda: "from A" in _frame_text(frame_b))

            # User B types -> User A converges (bidirectional).
            frame_b.locator("#editor").click()
            frame_b.locator("#editor").press("End")
            frame_b.locator("#editor").press_sequentially(" +B")
            _wait(lambda: "+B" in _frame_text(frame_a))

            # Save -> converted bytes reach the mock WOPI host.
            frame_a.locator("#btn-save").click()
            _wait(lambda: "from A" in _host_text(servers) and "+B" in _host_text(servers))
            host_text = _host_text(servers)
            assert "from A" in host_text and "+B" in host_text

            # Editor notified its embedding host via postMessage (woopi bridge).
            msgs = parent_a.evaluate("window.__msgs")
            assert any(
                m.get("type") == "woopi" and m.get("action") in ("editing", "saved") for m in msgs
            )
        finally:
            ctx_a.close()
            ctx_b.close()
            browser.close()


def _word_count(frame):
    import re
    txt = frame.locator("#word-count").inner_text()
    m = re.search(r"(\d+)", txt)
    return int(m.group(1)) if m else 0


def test_status_bar_word_count_and_save_indicator(servers):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            ctx = browser.new_context()
            parent = ctx.new_page()
            parent.goto(_parent_url(servers))
            frame = parent.frame("ed")
            frame.locator("#editor").wait_for(state="visible", timeout=15000)

            # The status bar shows a live word count for the loaded document.
            wc0 = _word_count(frame)
            assert wc0 > 0, "status bar must show a word count"

            # Typing updates the count live.
            frame.locator("#editor").click()
            frame.locator("#editor").press("End")
            frame.locator("#editor").press_sequentially(" extra words here")
            _wait(lambda: _word_count(frame) > wc0 + 2)

            # Typing flips the save indicator away from a saved state.
            status0 = frame.locator("#status").inner_text().strip().lower()
            assert status0 != "ready", f"status should show unsaved, got {status0!r}"

            # Saving returns the indicator to saved/ready.
            frame.locator("#btn-save").click()
            _wait(
                lambda: frame.locator("#status").inner_text().strip().lower()
                in ("saved", "ready")
            )
        finally:
            ctx.close()
            browser.close()


def test_view_controls_zoom_theme_fullscreen(servers):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            ctx = browser.new_context()
            parent = ctx.new_page()
            parent.goto(_parent_url(servers))
            frame = parent.frame("ed")
            frame.locator("#editor").wait_for(state="visible", timeout=15000)

            # Zoom in scales only the editing surface (inline zoom grows).
            z0 = float(frame.locator("#editor").evaluate("el => parseFloat(el.style.zoom || '1')"))
            frame.locator("#btn-zoom-in").click()
            z1 = float(frame.locator("#editor").evaluate("el => parseFloat(el.style.zoom || '1')"))
            assert z1 > z0, f"zoom should increase: {z0} -> {z1}"
            # Content is unaffected by zoom.
            assert _frame_text(frame).strip()

            # Theme toggle flips the page background colour.
            bg0 = frame.evaluate("getComputedStyle(document.body).backgroundColor")
            frame.locator("#btn-theme").click()
            bg1 = frame.evaluate("getComputedStyle(document.body).backgroundColor")
            assert bg0 != bg1, f"theme should change bg: {bg0} -> {bg1}"

            # Fullscreen toggles the body class (browser Fullscreen API is
            # best-effort; the class drives the layout expansion).
            assert "fullscreen" not in frame.evaluate("document.body.className")
            frame.locator("#btn-fullscreen").click()
            assert "fullscreen" in frame.evaluate("document.body.className")
        finally:
            ctx.close()
            browser.close()
