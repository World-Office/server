# World Office Operations Runbook

**Version:** 1.0
**Date:** 2026-07-21
**Scope:** Production deployment of World Office services stack

---

## Architecture Overview

```
                         ┌──────────────┐
                         │   Traefik    │  (reverse proxy, TLS termination)
                         │   (host)     │
                         └──┬───┬───┬──┘
                            │   │   │
              ┌─────────────┘   │   └─────────────┐
              ▼                 ▼                 ▼
       ┌────────────┐   ┌────────────┐   ┌──────────────┐
       │  OpenCloud  │   │   Server   │   │  Admin Panel │
       │  (OCIS)     │   │  (Node.js) │   │  (React SPA) │
       │  :9200      │   │  :8082     │   │  :3000       │
       └────────────┘   └──────┬─────┘   └──────────────┘
                               │
               ┌───────────────┼───────────────────┐
               ▼               ▼                   ▼
       ┌────────────┐   ┌────────────┐   ┌────────────────┐
       │  Identity  │   │  Storage   │   │  Coauthoring   │
       │  Service   │   │  Service   │   │  Service       │
       │  :8001     │   │  :8003     │   │  :8004         │
       └────────────┘   └────────────┘   └────────────────┘
               ▼               ▼
       ┌────────────┐   ┌────────────┐
       │  Session   │   │ Conversion │
       │  Service   │   │ Service    │
       │  :8005     │   │  :8002     │
       └────────────┘   └────────────┘
```

---

## Service Inventory

| Service | Port | Language | Health Endpoint | Docker Image |
|---|---|---|---|---|
| api-gateway | 8000 | Rust | `GET /health` | ghcr.io/world-office/api-gateway |
| identity-service | 8001 | Rust | `GET /health` | ghcr.io/world-office/identity-service |
| conversion-service | 8002 | Rust | `GET /health` | ghcr.io/world-office/conversion-service |
| storage-service | 8003 | Rust | `GET /health` | ghcr.io/world-office/storage-service |
| coauthoring-service | 8004 | Rust | `GET /health` | ghcr.io/world-office/coauthoring-service |
| session-service | 8005 | Rust | `GET /health` | ghcr.io/world-office/session-service |
| server | 8082 | Node.js | `GET /healthcheck` | ghcr.io/world-office/server |
| admin-panel | 3000 | React | N/A (SPA) | ghcr.io/world-office/admin-panel |

---

## Deployment

### Prerequisites

- Docker Engine >= 24.x
- Docker Compose >= 2.20
- Prometheus + Grafana (for monitoring)

### Production Deploy

```bash
# 1. Pull latest images
docker compose -f docker-compose.prod.yml pull

# 2. Start stack
docker compose -f docker-compose.prod.yml up -d

# 3. Verify all services healthy
for svc in api-gateway identity-service conversion-service storage-service coauthoring-service session-service server; do
  port=$(grep -A5 "$svc" docker-compose.prod.yml | grep '"' | head -1 || echo "8000")
  curl -sf "http://localhost:${port}/health" && echo "$svc OK" || echo "$svc FAIL"
done
```

### CI/CD Pipeline

GitHub Actions (`.github/workflows/deploy.yml`):
1. On push to `main`
2. Build 8 Docker images (matrix build)
3. Push to ghcr.io
4. SSH into production host
5. Pull images and restart stack

---

## Monitoring

### Prometheus

Scrapes all service `/health` endpoints on the `prometheus` Docker network.

**Target files:** `observability/prometheus/prometheus.yml`

### Grafana Dashboards

| Dashboard | File | Panels |
|---|---|---|
| Services Overview | `observability/grafana/provisioning/dashboards/services-overview.json` | Health status, uptime, response times |
| Production Overview | `observability/grafana/provisioning/dashboards/production-overview.json` | Resource usage, request rates |
| Conversion Service | `observability/grafana/provisioning/dashboards/conversion-service.json` | Conversion rates, errors, duration |
| Docserver Health | `opencloud-docserver/grafana/docserver-health.json` | Docserver-specific metrics, SQLite, sessions |
| Logs | `observability/grafana/provisioning/dashboards/logs.json` | Centralized log viewer |

### Docserver Health Dashboard

The Python docserver (`opencloud-docserver`) ships a self-contained Grafana dashboard at
`opencloud-docserver/grafana/docserver-health.json`.

**Installation:** import the JSON via the Grafana UI (`Dashboards → New → Import`), or copy it
into the file-provisioning folder alongside the other dashboards.

**Metric contract** — the dashboard's PromQL targets define the series a Prometheus scrape of
the docserver `job="docserver"` must expose once `/metrics` is instrumented (`prometheus_client`,
scrape target `docserver:9091/metrics` per `observability/prometheus/prometheus.yml`):

| Metric | Type | Labels | Panel usage |
|---|---|---|---|
| `up{job="docserver"}` | standard | — | Health stat (UP/DOWN) |
| `opencloud_docserver_documents_total` | counter | — | Documents Stored stat |
| `opencloud_docserver_sessions_active` | gauge | — | Active Sessions stat |
| `opencloud_docserver_wopi_requests_total` | counter | `operation`, `status` | Request/error/5xx panels |
| `opencloud_docserver_wopi_request_duration_seconds` | histogram | `operation` | P50/P95 latency |
| `opencloud_docserver_lock_operations_total` | counter | `action` | Lock operations panel |
| `opencloud_docserver_putfile_bytes_total` | counter | — | Save-throughput panel |
| `process_resident_memory_bytes`, `process_virtual_memory_bytes` | gauge (process collector) | — | Memory panel |
| `process_cpu_seconds_total` | counter (process collector) | — | CPU panel |

The `job` and `operation` dashboard variables are wired into every query; set `job` to
`docserver` (or use the `All` option) to view the docserver fleet.

---

## Incident Response

### Service Unhealthy

```bash
docker compose ps
docker compose logs -f <service-name>
docker compose restart <service-name>
docker compose down && docker compose up -d  # full restart
```

### Disk Space

Storage service stores blobs on Docker volumes. Monitor:

```bash
df -h /var/lib/docker/volumes
du -sh /var/lib/docker/volumes/wo_storage_data
```

### High Memory

```bash
docker stats
```

Adjust resource limits in `docker-compose.prod.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 512M
```

---

## Backup & Recovery

### Configuration

```bash
cp docker-compose.prod.yml docker-compose.prod.yml.backup
```

### Collaboration Sessions

Sessions are ephemeral (in-memory SQLite). Restarting coauthoring-service drops active sessions. No persistent backup needed.

---

## Scaling

| Service | Strategy |
|---|---|
| api-gateway | Stateless — scale with `replicas` |
| coauthoring-service | Session-pinned (sticky WebSocket) — scale with care |
| conversion-service | Stateless — scale with `replicas` |
| storage-service | Stateful (SQLite + disk) — single instance recommended |
| identity-service | Stateless — scale with `replicas` |
| session-service | Stateless — scale with `replicas` |

---

## Upgrade Procedure

1. Backup config: `cp docker-compose.prod.yml docker-compose.prod.yml.backup`
2. Pull latest: `docker compose -f docker-compose.prod.yml pull`
3. Rolling restart: `docker compose up -d --no-deps <service>`
4. Verify health: `curl http://localhost:<port>/health`
5. Monitor Grafana for anomalies
