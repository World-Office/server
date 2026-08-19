# opencloud-docserver

Stoic Linux document server for [OpenCloud](https://opencloud.eu) (OCIS),
integrated via the [WOPI](https://learn.microsoft.com/en-us/microsoft-365/cloud-storage-partner-program/rest/) protocol.

**One process. One job: edit office documents through OpenCloud.**

- Python 3.12 + FastAPI — no Rust, no TypeScript, no WASM, no build step
- Vanilla JS editor — zero npm dependencies
- SQLite — a storage ledger, not a database server
- Single Docker image or a plain systemd unit

## Quick start (local)

```sh
cd opencloud-docserver
uv sync          # install deps
uv run pytest    # run tests

uv run uvicorn src.main:app --reload
# open http://localhost:8000/docs to see the API
```

### Seed a sample document

```sh
# From a Python shell with `uv run python`:
from docx import Document
Document().add_paragraph("Stoic dogcow test").save("sample.docx")

# Upload it:
curl -s -F "file=@sample.docx" http://localhost:8000/api/upload
# → {"id":"sample.docx","name":"sample.docx"}

# Edit it in the browser:
open http://localhost:8000/editor/sample.docx
```

## WOPI endpoints (host mode)

| Method | Path                     | Purpose                |
|--------|--------------------------|------------------------|
| GET    | `/wopi/files/{id}`       | CheckFileInfo          |
| GET    | `/wopi/files/{id}/contents` | GetFile            |
| POST   | `/wopi/files/{id}/contents` | PutFile            |
| POST   | `/wopi/files/{id}/lock`  | Lock / refresh lock    |
| POST   | `/wopi/files/{id}/unlock`| Unlock                 |
| POST   | `/wopi/files/{id}/getlock`| GetLock               |

## Editor endpoints

| Method | Path                              | Purpose                     |
|--------|-----------------------------------|-----------------------------|
| GET    | `/editor/{id}`                    | The web editor page         |
| GET    | `/api/documents/{id}/html`        | DOCX as editable HTML       |
| POST   | `/api/documents/{id}/save`        | Save HTML back to DOCX      |
| POST   | `/api/upload`                     | Create a document           |
| GET    | `/api/documents`                  | List documents              |

## OpenCloud (OCIS) integration

OpenCloud is the **WOPI host** (files + auth). This server is the **WOPI
client** (the editor). Two modes are supported:

1. **Local host mode (default)** — the docserver stores documents in its
   own SQLite store and implements the full WOPI host surface, so you can
   develop and test with zero external services.
2. **OCIS client mode** — when OCIS launches the editor it redirects the
   browser to `/editor/{id}?access_token=<jwt>&wopi_host=<ocis>`. The
   docserver then reads/writes file content through OCIS's WOPI service
   using that token. Configure `DOCSERVER_WOPI_HOST` (or `WOPI_HOST`)
   so the docserver knows which host to forward to.

## Configuration

All settings live in `config.toml` and can be overridden with environment
variables (`DOCSERVER_*`). See `config.toml` for the full list.

```sh
# Generate a real JWT secret:
openssl rand -base64 48
export DOCSERVER_JWT_SECRET="..."
```

## Deploy

### Docker

```sh
docker compose up -d --build
curl http://localhost:8000/health
```

### systemd

```sh
sudo useradd -r -m docserver
sudo mkdir -p /opt/opencloud-docserver /etc/opencloud-docserver
sudo cp -r src web config.toml /opt/opencloud-docserver/
sudo cp systemd/opencloud-docserver.service /etc/systemd/system/
sudo install -m600 -o root systemd/opencloud-docserver.env /etc/opencloud-docserver/env
sudo systemctl daemon-reload
sudo systemctl enable --now opencloud-docserver
```

## Philosophy

Stoic Linux. Simplicity, clarity, reliability, focus.

- stdlib first — `sqlite3`, `urllib`, `logging` before any dependency
- flat structure — at most 3 levels under `src/`
- small files — nothing over 400 lines
- one job per process — the docserver serves documents, period
- least privilege — non-root user, `NoNewPrivileges`, read-only `/usr`

> *"The best editor is the one you never have to patch at 3 AM."*
