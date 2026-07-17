#!/bin/bash
# World-Office Production Deployment Script
# Usage: ./deploy.sh [--dry-run] [--tag TAG] [--compose-path PATH]

set -euo pipefail

# Parse arguments
DRY_RUN=false
IMAGE_TAG="latest"
COMPOSE_PATH="/opt/worldoffice"

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --tag)
      IMAGE_TAG="$2"
      shift 2
      ;;
    --compose-path)
      COMPOSE_PATH="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "=== World-Office Deployment ==="
echo "Compose path: $COMPOSE_PATH"
echo "Image tag: $IMAGE_TAG"
echo "Dry run: $DRY_RUN"
echo ""

cd "$COMPOSE_PATH"

# Pull latest images
echo "📥 Pulling latest images..."
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would run: docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile observability pull"
else
  docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile observability pull
fi

# Start services
echo "🚀 Starting services..."
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would run: docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile observability up -d"
else
  docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile observability up -d
fi

# Verify deployment
echo "✅ Verifying deployment..."
if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] Would run: docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile observability ps"
else
  docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile observability ps
fi

echo ""
echo "🎉 Deployment complete!"
echo "Services are starting up. Check status with:"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"

echo ""
echo "Health check endpoints:"
echo "  http://localhost:8001/health          (identity-service)"
echo "  http://localhost:8002/health          (storage-service)"
echo "  http://localhost:8003/health          (conversion-service)"
echo "  http://localhost:8004/health          (coauthoring-service)"
echo "  http://localhost:8005/health          (session-service)"
echo "  http://localhost:8080/health          (api-gateway)"
echo "  http://localhost:80/health            (docserver)"
echo "  http://localhost:3000/healthcheck     (server)"