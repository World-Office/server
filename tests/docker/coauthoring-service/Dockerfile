# coauthoring-service — real-time collaboration microservice (E-CO-1).
# Multi-stage: build the rust binary from the workspace, run it slim.
FROM rust:1.85-bookworm AS builder
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY core ./core
COPY services ./services
RUN cargo build --release -p coauthoring-service

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /src/target/release/coauthoring-service /usr/local/bin/coauthoring-service
EXPOSE 8004
ENV SERVICE_HOST=0.0.0.0 SERVICE_PORT=8004
CMD ["coauthoring-service"]