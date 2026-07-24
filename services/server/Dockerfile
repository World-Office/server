# ===========================================================================
# World-Office Node.js Server — multi-stage Docker build
# Context: services/server/
# Image: worldoffice/server:latest
# ===========================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the server source (context is services/server/)
COPY . .

# Install root deps + sub-module deps (install:* = npm ci --prefix in each sub-module)
RUN npm ci && npm run build

# ---------------------------------------------------------------------------
# Stage 2: Minimal runtime image — only DocService + Common
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

# Create non-root user, add curl for healthcheck
RUN addgroup -g 1001 worldoffice && \
    adduser -u 1001 -G worldoffice -D -h /app worldoffice && \
    apk add --no-cache curl

# Copy root package files + node_modules
COPY --from=builder --chown=worldoffice:worldoffice /app/package.json ./
COPY --from=builder --chown=worldoffice:worldoffice /app/npm-shrinkwrap.json ./
COPY --from=builder --chown=worldoffice:worldoffice /app/node_modules ./node_modules

# Copy DocService (main app) and Common (required by DocService — relative requires)
COPY --from=builder --chown=worldoffice:worldoffice /app/DocService ./DocService
COPY --from=builder --chown=worldoffice:worldoffice /app/Common ./Common

# Prune devDependencies from root (sub-module node_modules already production-only)
RUN npm prune --omit=dev

# Create data directories
RUN mkdir -p /var/lib/worldoffice/data /var/lib/worldoffice/logs /var/log/worldoffice && \
    chown -R worldoffice:worldoffice /var/lib/worldoffice /var/log/worldoffice

# Switch to the non-root user
USER worldoffice

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the default port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/healthcheck || exit 1

# Start the server
ENTRYPOINT ["node", "DocService/sources/server.js"]