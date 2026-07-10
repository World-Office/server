# World-Office Production Deployment

## Overview

This document describes the image-based deployment pipeline for World-Office.

## Architecture

### Services

World-Office consists of 8 services:

1. **identity-service** - User authentication and authorization
2. **storage-service** - File storage backend
3. **conversion-service** - Document format conversion
4. **coauthoring-service** - Real-time collaboration
5. **session-service** - User session management
6. **api-gateway** - API routing and aggregation
7. **docserver** - Document server (Rust)
8. **server** - Document server (Node.js)

### Deployment Flow

```
Code Changes → CI/CD Pipeline → Container Registry → Production Server
```

## Deployment Process

### 1. Build and Push Images

The CI/CD pipeline automatically:
- Builds Docker images for all services
- Pushes images to Codeberg Container Registry
- Tags images with commit SHA and "latest"

### 2. Pull and Deploy

On the production server:
```bash
# Pull latest images
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

# Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 3. Verify

Check service status:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Check health endpoints:
```bash
curl http://localhost:8001/health          # identity-service
curl http://localhost:8002/health          # storage-service
curl http://localhost:8003/health          # conversion-service
curl http://localhost:8004/health          # coauthoring-service
curl http://localhost:8005/health          # session-service
curl http://localhost:8080/health          # api-gateway
curl http://localhost:80/health            # docserver
curl http://localhost:3000/healthcheck     # server
```

## Manual Deployment

Use the deployment script:
```bash
./deploy.sh [--dry-run] [--tag TAG] [--compose-path PATH]
```

Options:
- `--dry-run`: Show what would be done without making changes
- `--tag TAG`: Deploy specific image tag (default: latest)
- `--compose-path PATH`: Path to docker-compose files (default: /opt/worldoffice)

## Configuration

### Environment Variables

Create a `.env` file in your compose directory:
```env
# Database
POSTGRES_USER=worldoffice
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=world_office

# Services
JWT_SECRET=your_secure_jwt_secret
RUST_LOG=info

# Ports
IDENTITY_PORT=8001
STORAGE_PORT=8002
CONVERSION_PORT=8003
COAUTHORING_PORT=8004
SESSION_PORT=8005
GATEWAY_PORT=8080
DOCSERVER_PORT=80
SERVER_PORT=3000
```

### Secrets

Required CI/CD secrets:
- `DEPLOY_HOST`: Production server hostname/IP
- `DEPLOY_USER`: SSH username
- `DEPLOY_SSH_KEY`: SSH private key
- `REGISTRY_USERNAME`: Container registry username
- `REGISTRY_PASSWORD`: Container registry password

## Monitoring

Health check endpoints are available for all services. Use these for monitoring and alerting.

## Rollback

To rollback to a previous version:
```bash
# Deploy specific tag
./deploy.sh --tag previous-commit-sha

# Or manually
IMAGE_TAG=previous-commit-sha docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
IMAGE_TAG=previous-commit-sha docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Check logs
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f [service-name]
```

### Restart specific service
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart [service-name]
```

### Check resource usage
```bash
docker stats
```

## Security

- All services run as non-root user (UID 1001)
- JWT secrets should be rotated regularly
- Database passwords should be complex and unique
- Container registry credentials should be protected

## Performance

- Use `--pull` flag to ensure latest images
- Monitor container resource usage
- Scale services as needed based on load

## Migration from SCP-based Deployment

The old deployment used SCP and sed to modify files on the production server. The new image-based deployment:

✅ **Benefits:**
- Reproducible deployments
- Auditable changes via image tags
- Easy rollback capability
- Consistent environments
- Better security (no file modification on production)

🚀 **Migration Steps:**
1. Update CI/CD secrets with registry credentials
2. Deploy using new pipeline
3. Verify all services are healthy
4. Monitor for any issues

## Files

- `docker-compose.yml`: Infrastructure services (PostgreSQL, Redis, RabbitMQ, observability)
- `docker-compose.prod.yml`: Production services using pre-built images
- `deploy.sh`: Deployment script
- `services.Dockerfile`: Multi-service Rust Dockerfile
- `core/crates/wo-docserver/Dockerfile`: Document server Dockerfile
- `services/server/Dockerfile`: Node.js server Dockerfile