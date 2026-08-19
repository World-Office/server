"""Editor router: serves the web editor and converts content.

Endpoints:
    GET  /editor/{doc_id}            -- the editor page (HTML)
    GET  /api/documents/{doc_id}     -- document metadata
    GET  /api/documents/{doc_id}/html -- DOCX as HTML for editing
    POST /api/documents/{doc_id}/save -- save HTML back to DOCX
    POST /api/documents/{doc_id}/lock -- acquire editing lock
    POST /api/documents/{doc_id}/unlock
    GET  /api/documents              -- list
    POST /api/upload                 -- create a document from upload
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates

from ..editor.converter import docx_to_html, html_to_docx
from ..editor.session import (
    RemoteWopiClient,
    SessionRegistry,
    session_from_token,
)
from ..wopi.protocol import LOCK_HEADER

router = APIRouter()

WEB_DIR = Path(__file__).resolve().parent.parent.parent / "web"
_templates = Jinja2Templates(directory=str(WEB_DIR))


def _store(request: Request):
    return request.app.state.store


def _registry(request: Request) -> SessionRegistry:
    return request.app.state.sessions


def _client(request: Request, doc_id: str) -> RemoteWopiClient | None:
    session = _registry(request).get(doc_id)
    if session and session.in_client_mode:
        return RemoteWopiClient(
            session.remote_host or "",
            session.access_token or "",
        )
    return None


# ----------------------------------------------------------------------
# Editor page
# ----------------------------------------------------------------------

@router.get("/editor/{doc_id}", response_class=HTMLResponse)
async def editor_page(doc_id: str, request: Request) -> HTMLResponse:
    """Serve the editor page. In client mode we register a session from
    the OCIS-issued access_token before serving."""
    token = request.query_params.get("access_token")
    wopi_host = (
        request.app.state.config.wopi_host or request.query_params.get("wopi_host")
    )

    if token and wopi_host:
        session = session_from_token(token, request.app.state.config.jwt_secret)
        if session and session.doc_id:
            session.remote_host = wopi_host
            session.access_token = token
            _registry(request).register(session)

    return _templates.TemplateResponse(
        request,
        "index.html",
        {"doc_id": doc_id, "name": _doc_name(request, doc_id)},
    )


def _doc_name(request: Request, doc_id: str) -> str:
    doc = _store(request).get(doc_id)
    if doc:
        return doc["name"]
    session = _registry(request).get(doc_id)
    return session.name if session else "document.docx"


# ----------------------------------------------------------------------
# Document API
# ----------------------------------------------------------------------

@router.get("/api/documents/{doc_id}/html")
async def document_html(doc_id: str, request: Request) -> JSONResponse:
    """Return the editable HTML of a document.

    Reads bytes from the local store, or from the remote WOPI host when
    in client mode, then converts DOCX -> HTML.
    """
    data = _load_bytes(request, doc_id)
    if data is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    try:
        html = docx_to_html(data)
    except Exception as exc:
        return JSONResponse({"error": f"conversion failed: {exc}"}, status_code=500)
    return JSONResponse({"html": html, "name": _doc_name(request, doc_id)})


@router.post("/api/documents/{doc_id}/save")
async def save_document(doc_id: str, request: Request) -> JSONResponse:
    """Convert submitted HTML back to DOCX and persist."""
    body = await request.body()
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return JSONResponse({"error": "invalid JSON"}, status_code=400)
    html = payload.get("html", "")

    try:
        docx_bytes = html_to_docx(html)
    except Exception as exc:
        return JSONResponse({"error": f"conversion failed: {exc}"}, status_code=500)

    client = _client(request, doc_id)
    if client:
        try:
            client.put_contents(doc_id, docx_bytes)
        except Exception as exc:
            return JSONResponse({"error": f"remote save failed: {exc}"}, status_code=502)
        _registry(request).get(doc_id)
    else:
        _store(request).put_content(doc_id, docx_bytes)

    return JSONResponse({"ok": True, "size": len(docx_bytes)})


@router.get("/api/documents/{doc_id}")
async def document_meta(doc_id: str, request: Request) -> JSONResponse:
    """Return document metadata (size, name, lock state)."""
    doc = _store(request).get(doc_id)
    if doc is None:
        session = _registry(request).get(doc_id)
        if session is None:
            return JSONResponse({"error": "not found"}, status_code=404)
        return JSONResponse(
            {
                "id": doc_id,
                "name": session.name,
                "size": session.size,
                "locked": bool(session.lock_token),
                "client_mode": session.in_client_mode,
            }
        )
    return JSONResponse(
        {
            "id": doc_id,
            "name": doc["name"],
            "size": doc["size"],
            "updated_at": doc["updated_at"],
            "locked": bool(doc["lock_token"]),
        }
    )


@router.get("/api/documents")
async def document_list(request: Request) -> JSONResponse:
    """List all locally stored documents."""
    docs = _store(request).list()
    return JSONResponse(
        [{"id": d["id"], "name": d["name"], "size": d["size"]} for d in docs]
    )


@router.post("/api/upload")
async def upload_document(file: UploadFile, request: Request) -> JSONResponse:
    """Create a document record from an uploaded file."""
    data = await file.read()
    if not data:
        return JSONResponse({"error": "empty file"}, status_code=400)
    doc_id = file.filename or "doc"
    store = _store(request)
    store.init(doc_id, file.filename or "document.docx")
    store.put_content(doc_id, data)
    return JSONResponse({"id": doc_id, "name": file.filename})


# ----------------------------------------------------------------------
# Locking (editor-level convenience over the WOPI host store)
# ----------------------------------------------------------------------

@router.post("/api/documents/{doc_id}/lock")
async def acquire_lock(doc_id: str, request: Request) -> JSONResponse:
    store = _store(request)
    if store.get(doc_id) is None:
        return JSONResponse({"error": "not found"}, status_code=404)
    store.set_lock(doc_id, "editor-" + next(iter(request.query_params), ""))
    return JSONResponse({"ok": True}, headers={LOCK_HEADER: store.get_lock(doc_id)})


@router.post("/api/documents/{doc_id}/unlock")
async def release_lock(doc_id: str, request: Request) -> JSONResponse:
    _store(request).release_lock(doc_id)
    return JSONResponse({"ok": True})


def _load_bytes(request: Request, doc_id: str) -> bytes | None:
    client = _client(request, doc_id)
    if client:
        try:
            return client.get_contents(doc_id)
        except Exception:
            return None
    return _store(request).get_content(doc_id)
