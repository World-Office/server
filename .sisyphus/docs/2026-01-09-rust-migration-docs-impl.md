# C++ to Rust Migration Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update README files, AGENTS.md, and CHANGELOG to document the C++ to Rust Document Server migration.

**Architecture:** Documentation-only update. Add 6 sections across 5 markdown files with pre-written content. No code changes required.

**Tech Stack:** Markdown files — server/README.md, AGENTS.md files, CHANGELOG.md

---

## File Structure

Files to modify based on design spec:
1. `server/README.md` — Document Server Architecture + Architecture Diagram
2. `/home/weiss/git/World-Office/AGENTS.md` — KEY FACTS line update
3. `server/core/AGENTS.md` — wo-docserver Implementation Notes section
4. `server/tests/README.md` — Document Server (Rust) build details
5. `server/core/CHANGELOG.md` — Migration entry

Each file receives a single atomic change. No refactoring needed.

---

### Task 1: Add Document Server Architecture to server/README.md

**Files:**
- Modify: `server/README.md:42` (insert before "## Rust Core (26 Crates)" section)

- [ ] **Step 1: Read current file to find exact insertion point**

```bash
head -50 server/README.md | tail -20
```

Expected: Shows lines 31-50 containing the Architecture diagram and "## Rust Core (26 Crates)" header

- [ ] **Step 2: Add Document Server Architecture section**

Insert this content at line 42 (before "## Rust Core (26 Crates)"):

```markdown
## Document Server Architecture

The Document Server (`wo-docserver`) is a Rust-based WOPI client that replaces the former C++ Document Server.

### Responsibilities:
- **WOPI Client**: Implements CheckFileInfo, GetFile, PutFile WOPI endpoints
- **Editor UI Hosting**: Serves React-based editors from `apps/web/apps/`
- **WOPI Discovery Proxies**: Proxies `/hosting/discovery` and `/hosting/wopi/*` to WOPI host
- **Format Conversion**: Backend for `wo-x2t` format conversion orchestration

### Key Differences from C++ Document Server:
- **Language**: Rust (axum/tokio) instead of C++
- **Build Time**: ~5-10 minutes instead of 2-4 hours
- **Editor UI**: React-based editors from monorepo instead of compiled JavaScript
- **Deploy**: Single binary or Docker container

```

- [ ] **Step 3: Verify markdown syntax**

```bash
head -80 server/README.md | tail -40
```

Expected: New section appears correctly formatted with proper heading levels

- [ ] **Step 4: Commit**

```bash
cd server
git add README.md
git commit -m "docs: add Document Server Architecture section to README" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 2: Add Architecture Diagram to server/README.md

**Files:**
- Modify: `server/README.md:67` (insert after "Document Server Architecture" section, before "## Rust Core")

- [ ] **Step 1: Verify Task 1 completed and find insertion point**

```bash
grep -n "## Rust Core" server/README.md | head -1
```

Expected: Returns line number (should now be ~69 after Task 1 insertion)

- [ ] **Step 2: Add Architecture Diagram section**

Insert at the line number returned above:

```markdown
### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Browser                         │
│  (React Document/Spreadsheet/Presentation Editors)          │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP/HTTPS
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              wo-docserver (Rust)                            │
│  ┌──────────────────┬────────────────────────────────────┐ │
│  │  WOPI Client      │  Editor UI Hosting                │ │
│  │  - CheckFileInfo │  - /hosting/wopi/*                 │ │
│  │  - GetFile       │  - /hosting/discovery (proxy)     │ │
│  │  - PutFile       │  - Serves React apps from apps/    │ │
│  └────────┬─────────┴────────┬───────────────────────────┘ │
│           │                  │                              │
│           │ WOPI protocol    │                              │
└───────────┼──────────────────┼──────────────────────────────┘
            │                  │
        ┌───▼──────────────────▼────┐
        │   WOPI Host (OCIS)        │
        │   - File storage           │
        │   - WOPI discovery         │
        │   - Auth (built-in IDP)    │
        └────────────────────────────┘
```

**Request Flow:**
1. Browser requests `http://docserver:8080/hosting/wopi/word/edit?wopisrc=...`
2. wo-docserver serves React editor UI with embedded `WOPISrc` parameter
3. Editor loads and makes WOPI requests to `/wopi/files/{id}/`, `/wopi/files/{id}/contents/`
4. wo-docserver proxies these to OCIS (WOPI host) with JWT authentication
5. OCIS returns file metadata/content, wo-docserver forwards to editor
```

- [ ] **Step 3: Verify diagram rendering**

```bash
head -120 server/README.md | tail -60
```

Expected: ASCII diagram appears with proper spacing, no broken markdown

- [ ] **Step 4: Commit**

```bash
cd server
git add README.md
git commit -m "docs: add Document Server architecture diagram to README" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 3: Update KEY FACTS section in workspace AGENTS.md

**Files:**
- Modify: `/home/weiss/git/World-Office/AGENTS.md:27` (KEY FACTS section)

- [ ] **Step 1: Read KEY FACTS section**

```bash
head -40 /home/weiss/git/World-Office/AGENTS.md | tail -15
```

Expected: Shows KEY FACTS bullet list around lines 20-35

- [ ] **Step 2: Add wo-docserver note to KEY FACTS**

Add this line to the KEY FACTS section (around line 27, after other bullet points):

```markdown
- wo-docserver serves editor UI and proxies WOPI requests
```

- [ ] **Step 3: Verify addition**

```bash
head -50 /home/weiss/git/World-Office/AGENTS.md | grep -A5 -B5 "wo-docserver"
```

Expected: New line appears in KEY FACTS section with proper formatting

- [ ] **Step 4: Commit**

```bash
git add /home/weiss/git/World-Office/AGENTS.md
git commit -m "docs: update workspace AGENTS.md KEY FACTS for wo-docserver" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 4: Add wo-docserver Implementation Notes to core/AGENTS.md

**Files:**
- Modify: `server/core/AGENTS.md:41` (after wo-docserver entry in Protocol and Infrastructure section)

- [ ] **Step 1: Read Protocol and Infrastructure section**

```bash
head -50 server/core/AGENTS.md | tail -15
```

Expected: Shows wo-docserver entry around line 41

- [ ] **Step 2: Add Implementation Notes subsection**

Append after wo-docserver entry:

```markdown
#### wo-docserver Implementation Notes

**Built with:** axum (routes), tokio (async runtime)

**Key features:**
- WOPI endpoints: `/wopi/files/{id}`, `/wopi/files/{id}/contents` (GET/POST), `/hosting/discovery` (proxy), `/hosting/wopi/{path}`
- JWT validation via `JWT_SECRET` env var
- Editor UI served from `apps/web/apps/*/dist/` directories
- WOPI host configuration via `WOPI_HOST` env var (also accepts `WOPI_HOST_URL`)

**Directory structure:**
```
wo-docserver/
├── src/
│   ├── lib.rs       # Route registration, app factory
│   ├── config.rs    # Env var parsing, JWT secret loading
│   ├── wopi.rs      # WopiClient for OCIS communication
│   └── static_files.rs  # Discovery handler, editor UI serving
└── Cargo.toml
```

**Testing:**
```bash
cargo build -p wo-docserver --release
cargo test -p wo-docserver
```
```

- [ ] **Step 3: Verify addition**

```bash
tail -50 server/core/AGENTS.md | head -40
```

Expected: wo-docserver Implementation Notes appears at end of file with proper formatting

- [ ] **Step 4: Commit**

```bash
cd server/core
git add AGENTS.md
git commit -m "docs: add wo-docserver Implementation Notes to core/AGENTS.md" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 5: Add Document Server (Rust) section to tests/README.md

**Files:**
- Modify: `server/tests/README.md:50` (under "Quick Start" section, after "### 1. Clone and Install")

- [ ] **Step 1: Quick Start section with context**

```bash
head -60 server/tests/README.md | tail -20
```

Expected: Shows Quick Start section structure around lines 45-60

- [ ] **Step 2: Add Document Server (Rust) subsection**

Insert this content after the "### 1. Clone and Install" subsection:

```markdown
## Document Server (Rust)

The Document Server container builds the Rust-based `wo-docserver` from `World-Office/server`.

**Build details:**
- Base image: `debian:bookworm-slim`
- Rust toolchain: nightly (via rust-toolchain.toml)
- Build time: ~5-10 minutes (vs 2-4 hours for C++)
- Ports exposed: `:80` (HTTP)
- Required env vars:
  - `JWT_SECRET`: Token validation key (must match OCIS)
  - `WOPI_HOST`: OCIS WOPI host URL (e.g., `ocis:9200`)

**Endpoints:**
| Path | Method | Purpose |
|------|--------|---------|
| `/health` | GET | Health check |
| `/hosting/discovery` | GET | WOPI discovery (proxied to OCIS) |
| `/hosting/wopi/*` | GET | Editor UI routing |
| `/wopi/files/{id}` | GET | CheckFileInfo |
| `/wopi/files/{id}/contents` | GET/POST | GetFile / PutFile |
```

- [ ] **Step 3: Verify section placement**

```bash
head -100 server/tests/README.md | tail -50
```

Expected: Document Server section appears after "Clone and Install", before other Quick Start subsections

- [ ] **Step 4: Commit**

```bash
cd server/tests
git add README.md
git commit -m "docs: add Document Server Rust build details to tests/README.md" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

### Task 6: Add migration entry to core/CHANGELOG.md

**Files:**
- Modify: `server/core/CHANGELOG.md:3` (beginning of "develop" section)

- [ ] **Step 1: Read current CHANGELOG**

```bash
cat server/core/CHANGELOG.md
```

Expected: Shows existing "## develop" section with minimal content

- [ ] **Step 2: Add wo-docserver migration entry**

After the line `## develop`, add this subsection:

```markdown
### wo-docserver
* **migration-complete**: Replaced C++ Document Server with Rust implementation
  - WOPI endpoints (CheckFileInfo, GetFile, PutFile) implemented in Rust
  - `/hosting/discovery` and `/hosting/wopi/*` routes added for editor UI
  - Editor UI now served from `apps/web/apps/*/dist/` React builds
  - JWT validation via `JWT_SECRET` env var
  - Single binary deployment with ~5-10 min build time
  - WOPI host configuration via `WOPI_HOST` env var (aliased to `WOPI_HOST_URL`)
  - E2E Dockerfile rewritten to build from Rust sources instead of C++
```

- [ ] **Step 3: Verify CHANGELOG formatting**

```bash
cat server/core/CHANGELOG.md
```

Expected: wo-docserver aparece as first entry under "## develop"

- [ ] **Step 4: Final commit**

```bash
cd server/core
git add CHANGELOG.md
git commit -m "docs: add wo-docserver migration entry to CHANGELOG" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Final Verification

After completing all 6 tasks:

- [ ] **Verify markdown syntax across all modified files**
```bash
# Check for broken links or malformed markdown
grep -n '<' /home/weiss/git/World-Office/AGENTS.md
grep -n '<' server/README.md
grep -n '<' server/core/AGENTS.md
grep -n '<' server/tests/README.md
grep -n '<' server/core/CHANGELOG.md
```

Expected: No unmatched angle brackets or broken markdown

- [ ] **Review all changes**
```bash
git log --oneline HEAD~6..HEAD
git diff HEAD~6 HEAD --stat
```

Expected: 6 commits, one per task, covering all 5 modified files

---

## Spec Coverage

| Spec Section | Task | Status |
|--------------|------|--------|
| Section 1: Main README updates | Task 1 | ✅ |
| Section 2: Architecture diagram | Task 2 | ✅ |
| Section 3: Core/AGENTS.md updates | Task 4 | ✅ |
| Section 4: Tests/README updates | Task 5 | ✅ |
| Section 5: CHANGELOG entry | Task 6 | ✅ |
| Workspace AGENTS.md KEY FACTS | Task 3 | ✅ |

All spec requirements covered.