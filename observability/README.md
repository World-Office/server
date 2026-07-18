# World-Office Observability Stack

This directory contains configuration for the World-Office observability stack:
Prometheus (metrics), Loki (logs), Tempo (traces), and Grafana (dashboards).

## Components

| Component   | Description                              | Port  |
|-------------|------------------------------------------|-------|
| **Prometheus** | Metrics collection and alerting        | 9090  |
| **Loki**       | Log aggregation                         | 3100  |
| **Tempo**      | Distributed tracing                     | 3200 (HTTP), 4317 (gRPC OTLP) |
| **Grafana**    | Visualization and dashboards            | 3000  |

## Directory Layout

```
observability/
├── grafana/
│   └── provisioning/
│       ├── dashboards/        # JSON dashboard definitions
│       │   ├── dashboards.yml           # Dashboard provider config
│       │   ├── services-overview.json   # Service health & metrics
│       │   ├── production-overview.json # Production health overview
│       │   ├── conversion-service.json  # Conversion pipeline metrics
│       │   └── logs.json                # Loki log explorer
│       └── datasources/
│           └── datasources.yml          # Prometheus/Loki/Tempo datasources
├── prometheus/
│   ├── prometheus.yml         # Scrape config (all services)
│   └── alerts.yml             # Alerting rules
├── loki/
│   └── loki.yml               # Log storage config
├── tempo/
│   └── tempo.yml              # Trace storage config
└── README.md                  # This file
```

## How to Start

### With Docker Compose

From the project root, run:

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

If the observability compose file doesn't exist yet, create a minimal override:

```yaml
# docker-compose.observability.yml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./observability/prometheus:/etc/prometheus
    ports:
      - "9090:9090"

  loki:
    image: grafana/loki:latest
    volumes:
      - ./observability/loki:/etc/loki
    ports:
      - "3100:3100"

  tempo:
    image: grafana/tempo:latest
    volumes:
      - ./observability/tempo:/etc/tempo
    ports:
      - "3200:3200"
      - "4317:4317"

  grafana:
    image: grafana/grafana:latest
    volumes:
      - ./observability/grafana/provisioning:/etc/grafana/provisioning
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
```

### Individual Services

Each service can also be started independently with Docker:

```bash
docker run -d -p 9090:9090 -v $(pwd)/observability/prometheus:/etc/prometheus prom/prometheus
docker run -d -p 3100:3100 -v $(pwd)/observability/loki:/etc/loki grafana/loki
docker run -d -p 3200:3200 -p 4317:4317 -v $(pwd)/observability/tempo:/etc/tempo grafana/tempo
docker run -d -p 3000:3000 -v $(pwd)/observability/grafana/provisioning:/etc/grafana/provisioning grafana/grafana
```

## Dashboards

| Dashboard                    | UID                     | Description |
|------------------------------|-------------------------|-------------|
| Services Overview            | `world-office-services` | Per-service health, request rate, error rate, latency, memory, CPU |
| Production Overview          | `world-office-production` | Aggregate system health, conversion metrics, alerts |
| Conversion Service           | `world-office-conversion` | Conversion throughput, duration, success rate |
| Logs (Loki)                  | `world-office-logs`     | Log volume, error log rate, interactive log explorer |

## Prometheus Metrics Endpoints

All Rust microservices expose Prometheus metrics at `/metrics`:

| Service              | Port | Endpoint            |
|----------------------|------|---------------------|
| api-gateway          | 8080 | http://localhost:8080/metrics |
| identity-service     | 8001 | http://localhost:8001/metrics |
| storage-service      | 8002 | http://localhost:8002/metrics |
| conversion-service   | 8003 | http://localhost:8003/metrics |
| coauthoring-service  | 8004 | http://localhost:8004/metrics |
| session-service      | 8005 | http://localhost:8005/metrics |
| docserver (Node.js)  | 9091 | http://localhost:9091/metrics |

## Alerting

Alert rules are defined in `prometheus/alerts.yml` and cover:

- **ServiceDown** — critical if any service is unreachable for >2m
- **HighErrorRate** — warning if HTTP 5xx rate >10% for 5m
- **HighLatency** — warning if P99 latency >5s for 5m
- **HighMemoryUsage** — warning if RSS memory >1GB for 10m
- **ConversionFailures** — warning if conversion failures >0.5/m for 5m
- **LowConversionSuccessRate** — critical if success rate <80% for 10m
