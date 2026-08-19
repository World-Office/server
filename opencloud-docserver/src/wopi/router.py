"""WOPI host router: CheckFileInfo, GetFile, PutFile, Lock/Unlock.

This server plays WOPI **host** when serving documents from its local
SQLite store, and WOPI **client** when launched by OCIS with an access
token (see `src/editor/session.py` for the client-side forwarding).

Endpoints (per WOPI spec):
    GET  /wopi/files/{id}             -- CheckFileInfo
    GET  /wopi/files/{id}/contents    -- GetFile
    POST /wopi/files/{id}/contents    -- PutFile
    POST /wopi/files/{id}/lock        -- Lock
    POST /wopi/files/{id}/unlock      -- Unlock
    POST /wopi/files/{id}/refreshlock -- RefreshLock
    POST /wopi/files/{id}/getlock     -- GetLock
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from ..lib.store import DocumentStore
from .protocol import (
    LOCK_HEADER,
    WopiError,
    file_info_response,
    lock_mismatch_error,
)

router = APIRouter()

# Content types by extension (kept deliberately small).
CONTENT_TYPES = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".txt": "text/plain",
    ".md": "text/markdown",
}

MAX_FILE_SIZE = 128 * 1024 * 1024  # 128 MiB


def _content_type(name: str) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return CONTENT_TYPES.get(f".{ext}", "application/octet-stream")


def _wopi_error_response(err: WopiError, lock: str = "") -> JSONResponse:
    headers = {LOCK_HEADER: lock} if lock else {}
    return JSONResponse(status_code=err.status, content={"error": err.message}, headers=headers)


def _lock_error(store: DocumentStore, doc_id: str, expected: str) -> JSONResponse:
    current = store.get_lock(doc_id)
    return _wopi_error_response(lock_mismatch_error(expected, current), lock=current)


def _store_of(request: Request) -> DocumentStore:
    return request.app.state.store


def _check_file(request: Request, doc_id: str) -> JSONResponse:
    store = _store_of(request)
    doc = store.get(doc_id)
    if doc is None:
        return _wopi_error_response(WopiError(404, f"File not found: {doc_id}"))
    return JSONResponse(
        file_info_response(
            name=doc["name"],
            version=str(doc["updated_at"]),
            size=doc["size"],
            owner=doc["id"],
            user_id=doc["id"],
            user_name="Local User",
            last_modified=int(doc["updated_at"]),
        )
    )


@router.get("/wopi/files/{doc_id}")
async def check_file_info(doc_id: str, request: Request) -> JSONResponse:
    """WOPI CheckFileInfo: return document metadata as JSON."""
    return _check_file(request, doc_id)


@router.get("/wopi/files/{doc_id}/contents")
async def get_file(doc_id: str, request: Request) -> Response:
    """WOPI GetFile: return the raw document bytes."""
    store = _store_of(request)
    doc = store.get(doc_id)
    if doc is None:
        return _wopi_error_response(WopiError(404, f"File not found: {doc_id}"))
    data = store.get_content(doc_id)
    if data is None:
        return _wopi_error_response(WopiError(404, f"Content missing for {doc_id}"))
    return Response(
        content=data,
        media_type=_content_type(doc["name"]),
        headers={"X-WOPI-ItemVersion": str(doc["updated_at"])},
    )


@router.post("/wopi/files/{doc_id}/contents")
async def put_file(doc_id: str, request: Request) -> JSONResponse:
    """WOPI PutFile: store new content, honouring the current lock."""
    store = _store_of(request)
    doc = store.get(doc_id)
    if doc is None:
        return _wopi_error_response(WopiError(404, f"File not found: {doc_id}"))

    lock = request.headers.get(LOCK_HEADER, "")
    current_lock = store.get_lock(doc_id)
    if current_lock and lock != current_lock:
        return _lock_error(store, doc_id, current_lock)

    body = await request.body()
    if len(body) > MAX_FILE_SIZE:
        return _wopi_error_response(WopiError(413, "File too large"))

    store.put_content(doc_id, body)
    return JSONResponse(
        {"ok": True, "size": len(body)},
        headers={"X-WOPI-Lock": store.get_lock(doc_id) or ""},
    )


def _require_lock_header(request: Request, store: DocumentStore, doc_id: str) -> str | None:
    lock = request.headers.get(LOCK_HEADER, "")
    current = store.get_lock(doc_id)
    if current and lock != current:
        return _lock_error(store, doc_id, current)
    if lock == "" and current:
        return _lock_error(store, doc_id, current)
    return None


@router.post("/wopi/files/{doc_id}/lock")
async def lock_file(doc_id: str, request: Request) -> JSONResponse:
    """WOPI Lock: acquire a lock unless another lock is held."""
    store = _store_of(request)
    if store.get(doc_id) is None:
        return _wopi_error_response(WopiError(404, f"File not found: {doc_id}"))
    lock = request.headers.get(LOCK_HEADER, "")
    current = store.get_lock(doc_id)

    if current:
        # Lock refresh if same token, otherwise conflict
        if lock == current:
            return JSONResponse({})
        return _lock_error(store, doc_id, current)

    user = request.query_params.get("user", "")
    store.set_lock(doc_id, lock, user)
    return JSONResponse({}, headers={LOCK_HEADER: lock})


@router.post("/wopi/files/{doc_id}/unlock")
async def unlock_file(doc_id: str, request: Request) -> JSONResponse:
    """WOPI Unlock: release the lock if the token matches."""
    store = _store_of(request)
    if store.get(doc_id) is None:
        return _wopi_error_response(WopiError(404, f"File not found: {doc_id}"))
    lock = request.headers.get(LOCK_HEADER, "")
    if store.get_lock(doc_id) and store.get_lock(doc_id) != lock:
        return _lock_error(store, doc_id, store.get_lock(doc_id))
    store.release_lock(doc_id)
    return JSONResponse({})


@router.post("/wopi/files/{doc_id}/refreshlock")
async def refresh_lock(doc_id: str, request: Request) -> JSONResponse:
    """WOPI RefreshLock: extend the lock lease."""
    store = _store_of(request)
    if store.get(doc_id) is None:
        return _wopi_error_response(WopiError(404, f"File not found: {doc_id}"))
    lock = request.headers.get(LOCK_HEADER, "")
    current = store.get_lock(doc_id)
    if current and lock != current:
        return _lock_error(store, doc_id, current)
    store.set_lock(doc_id, lock, store.get(doc_id).get("lock_user", ""))
    return JSONResponse({}, headers={LOCK_HEADER: lock})


@router.post("/wopi/files/{doc_id}/getlock")
async def get_lock(doc_id: str, request: Request) -> JSONResponse:
    """WOPI GetLock: return the current lock token."""
    store = _store_of(request)
    if store.get(doc_id) is None:
        return _wopi_error_response(WopiError(404, f"File not found: {doc_id}"))
    lock = store.get_lock(doc_id)
    return JSONResponse({}, headers={LOCK_HEADER: lock or " "})
