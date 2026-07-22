# ===========================================================================
# World-Office Node.js Server — multi-stage Docker build
# Image: worldoffice/server:latest
# ===========================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build the Node.js application
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json ./
COPY pnpm-lock.yaml ./

# Install dependencies using pnpm
RUN npm install -g pnpm@10.4.1
RUN pnpm install --frozen-lockfile

# Copy the entire source code
COPY . .

# Build the application
RUN pnpm build

# ---------------------------------------------------------------------------
# Stage 2: Minimal runtime image
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

# Create a non-root user and group (matching the Rust services pattern)
RUN addgroup -g 1001 worldoffice && \
    adduser -u 1001 -G worldoffice -D -h /app worldoffice

# Copy built files from builder
COPY --from=builder --chown=worldoffice:worldoffice /app/package.json ./
COPY --from=builder --chown=worldoffice:worldoffice /app/pnpm-lock.yaml ./
COPY --from=builder --chown=worldoffice:worldoffice /app/node_modules ./node_modules
COPY --from=builder --chown=worldoffice:worldoffice /app/dist ./dist
COPY --from=builder --chown=worldoffice:worldoffice /app/public ./public
COPY --from=builder --chown=worldoffice:worldoffice /app/views ./views

# Install only production dependencies
RUN npm install -g pnpm@10.4.1
RUN pnpm install --frozen-lockfile --prod

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
ENTRYPOINT ["pnpm", "start"]