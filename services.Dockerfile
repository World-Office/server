# ===========================================================================
# World-Office Microservices — multi-stage Docker build
#
# Builds a single service binary selected via SERVICE_NAME build arg.
# Usage:
#   docker build --build-arg SERVICE_NAME=identity-service -t worldoffice/identity-service .
# ===========================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build the Rust binary
# ---------------------------------------------------------------------------
FROM rust:bookworm AS builder

ARG SERVICE_NAME

WORKDIR /app

# Copy the workspace root Cargo.toml and all member directories — Cargo requires
# all workspace members to be present for dependency resolution, even when
# building a single crate with -p.
COPY Cargo.toml ./
COPY Cargo.lock ./
COPY core/ ./core/
COPY services/ ./services/
COPY core-enterprise/ ./core-enterprise/
COPY services-enterprise/ ./services-enterprise/

# Build only the selected service binary in release mode.
# CARGO_TARGET_DIR is set to /app/target to avoid polluting the source tree.
ENV CARGO_TARGET_DIR=/app/target
RUN cargo build --release -p "${SERVICE_NAME}"

# ---------------------------------------------------------------------------
# Stage 2: Minimal runtime image
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}

# Install runtime dependencies: curl for the HEALTHCHECK, ca-certificates for
# HTTPS outbound requests (WOPI callbacks, reqwest).
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Create a non-root user and group (matching the docserver Dockerfile pattern).
RUN groupadd --gid 1001 worldoffice && \
    useradd --uid 1001 --gid worldoffice --create-home --shell /bin/false worldoffice

WORKDIR /app

# Copy the compiled binary from the builder stage.
COPY --from=builder --chown=worldoffice:worldoffice /app/target/release/${SERVICE_NAME} /usr/local/bin/${SERVICE_NAME}

# Create data directories for the service.
RUN mkdir -p /var/lib/worldoffice /var/log/worldoffice && \
    chown -R worldoffice:worldoffice /var/lib/worldoffice /var/log/worldoffice

# Switch to the non-root user.
USER worldoffice

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["sh", "-c", "exec /usr/local/bin/${SERVICE_NAME} \"$@\"", "--"]
