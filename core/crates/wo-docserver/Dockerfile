# ===========================================================================
# World-Office Document Server — multi-stage Docker build
# Image: worldoffice/documentserver:latest
# ===========================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build the Rust binary
# ---------------------------------------------------------------------------
FROM rust:bookworm AS builder

WORKDIR /app

# Copy the workspace Cargo.toml and all member directories — Cargo requires
# all workspace members to be present for dependency resolution, even when
# building a single crate with -p.
COPY Cargo.toml ./
COPY Cargo.lock ./
COPY core/ ./core/
COPY services/ ./services/
COPY core-enterprise/ ./core-enterprise/
COPY services-enterprise/ ./services-enterprise/

# Build only the wo-docserver binary in release mode.
# CARGO_TARGET_DIR is set to /app/target to avoid polluting the source tree.
ENV CARGO_TARGET_DIR=/app/target
RUN cargo build --release -p wo-docserver

# ---------------------------------------------------------------------------
# Stage 2: Minimal runtime image
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies: curl for the HEALTHCHECK, ca-certificates for
# HTTPS outbound requests (WOPI callbacks, reqwest).
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user and group (matching the OpenCloud Dockerfile pattern).
RUN groupadd --gid 1001 worldoffice && \
    useradd --uid 1001 --gid worldoffice --create-home --shell /bin/false worldoffice

WORKDIR /app

# Copy the compiled binary from the builder stage.
COPY --from=builder --chown=worldoffice:worldoffice /app/target/release/wo-docserver /usr/local/bin/wo-docserver

# Create data directories expected by the OpenCloud integration volumes.
RUN mkdir -p /var/www/worldoffice/Data /var/log/worldoffice /var/lib/worldoffice && \
    chown -R worldoffice:worldoffice /var/www/worldoffice /var/log/worldoffice /var/lib/worldoffice

# Switch to the non-root user.
USER worldoffice

# ---------------------------------------------------------------------------
# Environment variables — documented for operators.
#
#   DOCSERVER_HOST    Bind host             (default: 0.0.0.0)
#   DOCSERVER_PORT    Bind port             (default: 80)
#   JWT_SECRET        JWT signing key       (REQUIRED — must match OCIS secret)
#   WOPI_HOST_URL     WOPI upstream URL     (default: http://ocis:9200)
#   EDITOR_UI_DIR     Editor UI assets dir  (default: ./editor-ui)
#   DOCSERVER_DATA_DIR Local data directory (default: ./data)
#
# Only set the port explicitly so the default (80) is clear to operators.
# ---------------------------------------------------------------------------
ENV DOCSERVER_PORT=80

# Expose the default bind port.  The OpenCloud compose maps this internally
# via DOCUMENT_SERVER_INTERNAL_PORT=80 and publishes through Traefik.
EXPOSE 80

# Health check against the /health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${DOCSERVER_PORT}/health || exit 1

ENTRYPOINT ["wo-docserver"]
