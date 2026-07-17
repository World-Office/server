# Document Server Dockerfile — Built from World-Office/server (Rust)
#
# This Dockerfile builds the World-Office Document Server from the Rust
# monorepo at https://codeberg.org/World-Office/server
#
# Build time: ~5-10 minutes (Rust + Node.js)
#
# Usage:
#   docker build -t worldoffice-documentserver:latest -f ../docker/documentserver/Dockerfile ../..
#   docker run -e JWT_SECRET=your_secret -e WOPI_HOST=http://ocis:9200 -p 8080:80 \
#     worldoffice-documentserver:latest

# =============================================================================
# Stage 1: Builder — Compile Rust binary and Node.js editor UI
# =============================================================================
FROM rust:1.85-bookworm AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    curl \
    wget \
    ca-certificates \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Clone the Rust monorepo (NOT from local workspace — ensures clean build context)
RUN git clone --depth=1 https://codeberg.org/World-Office/server.git

WORKDIR /build/server

# Build the Rust docserver binary
RUN cargo build -p wo-docserver --release

# Build the React editor UI (apps/web must be built for full integration)
# Uses corepack for pnpm management
WORKDIR /build/server/apps/web

# =============================================================================
# Stage 2: Runtime — Minimal image with only necessary components
# =============================================================================
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    fonts-dejavu \
    fonts-liberation \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create necessary directories
RUN mkdir -p /var/log/world-office \
    /var/lib/world-office/documentserver/App_Data/cache/files \
    /var/www/world-office/documentserver/Data \
    /etc/world-office/documentserver

WORKDIR /app

# Copy the compiled Rust binary
COPY --from=builder /build/server/target/release/wo-docserver /app/wo-docserver

# Copy the built React editor UI into versioned subdirectories expected by
# wo-docserver's resolve_editor_dir() — word/ sheet/ slide/ pdf/ diagram/
COPY --from=builder /build/server/apps/web/apps/documenteditor-react/dist /app/editor-ui/word/
COPY --from=builder /build/server/apps/web/apps/spreadsheeteditor-react/dist /app/editor-ui/sheet/
COPY --from=builder /build/server/apps/web/apps/presentationeditor-react/dist /app/editor-ui/slide/
COPY --from=builder /build/server/apps/web/apps/pdfeditor-react/dist /app/editor-ui/pdf/
COPY --from=builder /build/server/apps/web/apps/visioeditor-react/dist /app/editor-ui/diagram/

# Copy a minimal landing page as fallback (when no editor UI is built)
RUN echo '<!DOCTYPE html><html><head><title>World-Office Document Server</title></head><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>World-Office Document Server</h1><p>Rust-based document server is running.</p></div></body></html>' > /app/index.html

# JWT configuration — injected at runtime via -e JWT_SECRET=xxx
ARG JWT_SECRET=change_me
ENV JWT_SECRET=${JWT_SECRET}
ENV JWT_HEADER=Authorization
ENV JWT_IN_BODY=true

# WOPI host URL (OCIS endpoint)
ARG WOPI_HOST=http://ocis:9200
ENV WOPI_HOST=${WOPI_HOST}

# Editor UI directory (must match resolve_editor_dir() expectations: word/ sheet/ slide/ pdf/ diagram/)
ENV EDITOR_UI_DIR=/app/editor-ui
ENV DOCSERVER_HOST=0.0.0.0
ENV DOCSERVER_PORT=80

# Expose HTTP port (mapped to 8080 in docker-compose)
EXPOSE 80

# Health check — verify /hosting/discovery is reachable
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=30 \
    CMD curl -f http://localhost/hosting/discovery || exit 1

# Start the Rust document server
CMD ["/app/wo-docserver"]