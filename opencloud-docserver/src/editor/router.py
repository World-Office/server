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
import time
import urllib.parse
from pathlib import Path

from fastapi import APIRouter, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.templating import Jinja2Templates

from ..editor.converter import docx_to_html, html_to_docx
from ..editor.session import (
    EditorSession,
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


def _session_for(request: Request, doc_id: str) -> EditorSession | None:
    """Resolve the active session, preferring the per-launch session id (so
    concurrent editors of the same file never borrow each other's session)."""
    sid = request.query_params.get("session")
    if sid:
        session = _registry(request).get_by_id(sid)
        if session:
            return session
    return _registry(request).get(doc_id)


def _client(request: Request, doc_id: str) -> RemoteWopiClient | None:
    session = _session_for(request, doc_id)
    if session and session.in_client_mode:
        client = RemoteWopiClient(
            session.remote_host or "",
            session.access_token or "",
        )
        # The WOPI lock lives on the session (taken at launch); without it
        # the wopiserver refuses PutFile (409 unlocked file).
        client.lock_token = session.lock_token
        return client
    return None


# ----------------------------------------------------------------------
# Editor page
# ----------------------------------------------------------------------

WOPI_DISCOVERY_XML = """<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<wopi-discovery>
  <net-zone name="external-http">
    <app name="WorldOffice" favIconUrl="https://worldoffice.org/favicon.ico">
      <action name="view" ext="docx" urlsrc="{public_url}/editor"/>
      <action name="edit" ext="docx" urlsrc="{public_url}/editor"/>
    </app>
  </net-zone>
</wopi-discovery>"""


@router.get("/hosting/discovery")
async def wopi_discovery(request: Request) -> Response:
    """WOPI discovery XML consumed by OpenCloud's collaboration/app-provider.

    IMPORTANT (validated against real OpenCloud 7.3.0):
    - urlsrc must NOT contain an `access_token=` query param. OpenCloud appends
      `WOPISrc` (plus optional lang params) itself and then POSTs an
      urlencoded form to the resolved URL with the REAL access_token
      (plus file_id/embedded) in the body (see `editor_page`).
    - Do not use str.format() with the XML: it mangles braces; use replace().
    """
    xml = WOPI_DISCOVERY_XML.replace("{public_url}", request.app.state.config.public_url)
    return Response(content=xml, media_type="text/xml")


def _parse_launch(request: Request, form: dict | None):
    """Resolve (token, wopi_src, doc_id) from a WOPI launch request.

    OpenCloud POSTs a urlencoded form to the app URL: `access_token`,
    `file_id` and `embedded` live in the body; `WOPISrc`/`UI_LLCC` ride in
    the query string. GET launches (dev/local curl) put everything in the
    query string. Returns None when no usable launch params were found.
    """
    q = request.query_params
    token = (form or {}).get("access_token") or q.get("access_token")
    wopi_src = q.get("WOPISrc") or (form or {}).get("WOPISrc")
    doc_id = (form or {}).get("file_id")
    if wopi_src:
        parsed = urllib.parse.urlparse(wopi_src)
        if parsed.scheme and parsed.netloc:
            wopi_host = f"{parsed.scheme}://{parsed.netloc}"
        else:
            wopi_host = request.app.state.config.wopi_host or q.get("wopi_host")
        if not doc_id:
            doc_id = wopi_src.rstrip("/").split("/")[-1]
        if not doc_id:
            return None
        session = EditorSession(
            doc_id=doc_id,
            name="document.docx",
            size=0,
            version="1",
            last_modified=int(time.time()),
            remote_host=wopi_host,
            access_token=token or "",
        )
        _registry(request).register(session)
        # Take the WOPI lock on the remote host so saves (PutFile) succeed —
        # the wopiserver refuses PutFile on unlocked files (409). The lock is
        # owner-named (wo:{user}:{uuid}); if another user already holds it,
        # the session is served read-only instead of clobbering their edits.
        # Best effort: launch must never fail because of locking.
        if token:
            try:
                host = RemoteWopiClient(wopi_host, token)
                owner = ""
                try:
                    owner = (host.check_file_info(doc_id) or {}).get("UserId") or ""
                except Exception as exc:
                    print(f"[launch] CFI failed for {doc_id}: {exc!r}")
                # Unknown owner still gets an owner-named token (wo:unknown:…)
                # so other users can never steal the lock out from under us.
                lock_token, writable = host.acquire_or_adopt_lock(doc_id, owner=owner or "unknown")
                print(
                    f"[launch] doc={doc_id} owner={owner[:40]!r} writable={writable} "
                    f"lock={lock_token[:32] if lock_token else ''}"
                )
                session.lock_token = lock_token
                session.read_only = not writable
                session.user_id = owner
            except Exception as exc:
                print(f"[launch] lock failed for {doc_id}: {exc!r}")
                session.lock_token = ""
        return session
    # Legacy launch: signed token + explicit wopi_host (query params).
    wopi_host = request.app.state.config.wopi_host or q.get("wopi_host")
    if token and wopi_host:
        session = session_from_token(token, request.app.state.config.jwt_secret)
        if session and session.doc_id:
            session.remote_host = wopi_host
            session.access_token = token
            _registry(request).register(session)
            return session
    return None


@router.get("/editor")
@router.post("/editor")
async def editor_page_root(request: Request) -> HTMLResponse:
    """WOPI launch entry point (no path segment). OpenCloud POSTs a form
    here with the real access_token; the file id comes from WOPISrc."""
    return await editor_page("", request)


@router.get("/editor/{doc_id}")
@router.post("/editor/{doc_id}")
async def editor_page(doc_id: str, request: Request) -> HTMLResponse:
    """Serve the editor page.

    In client mode we register a session from the OCIS-issued access_token
    (form body on POST, query string on GET) before serving, so the editor's
    API calls can read/write through the remote WOPI host.
    """
    form = None
    if request.method == "POST":
        try:
            form = await request.form()
        except Exception:
            form = {}
    session = _parse_launch(request, form)
    # The editor resolves its doc id from the launch (form file_id or the last
    # segment of WOPISrc). At the root /editor path the path param is empty,
    # so use the resolved id (the editor JS reads __DOC_ID__).
    read_only = False
    session_id = ""
    if session and session.doc_id:
        doc_id = session.doc_id
        read_only = session.read_only
        session_id = session.session_id

    return _templates.TemplateResponse(
        request,
        "index.html",
        {
            "doc_id": doc_id,
            "name": _doc_name(request, doc_id),
            "read_only": read_only,
            "session_id": session_id,
        },
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
    if not data:
        # 0-byte file: start from a blank document so the user can just write;
        # the first save re-encodes the (now non-empty) HTML into a valid DOCX.
        return JSONResponse({"html": "", "name": _doc_name(request, doc_id), "blank": True})
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

    session = _session_for(request, doc_id)
    if session and session.read_only:
        return JSONResponse(
            {"error": "read-only: another user is editing this document"},
            status_code=403,
        )

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
    """Release the editing lock. In client mode this unlocks the remote WOPI
    host (called via a sendBeacon on editor unload); in host mode it clears
    the local store lock."""
    client = _client(request, doc_id)
    if client:
        client.release_lock(doc_id)
        return JSONResponse({"ok": True})
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
