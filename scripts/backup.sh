#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="./backups"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
RETENTION_DAYS=30

usage() {
  cat <<EOF
Usage: $0 [OPTION]

Back up production data for World Office services.

Options:
  --database    Back up SQLite databases from running containers
  --volumes     Back up Docker volumes via volumes-from
  --all         Back up both databases and volumes (default)
  --help        Show this message
EOF
  exit 0
}

MODE="all"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --database) MODE="database" ;;
    --volumes)  MODE="volumes" ;;
    --all)      MODE="all" ;;
    --help)     usage ;;
    *)          echo "Unknown option: $1" && usage ;;
  esac
  shift
done

mkdir -p "$BACKUP_DIR"
echo "Backup destination: $(realpath "$BACKUP_DIR")"

do_database() {
  echo "--- Database backups ---"
  for container in $(docker ps --filter "label=com.worldoffice.service" --format "{{.Names}}" 2>/dev/null); do
    echo "  Container: $container"
    local db_paths
    db_paths=$(docker inspect "$container" --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Destination}}{{end}}{{end}}' 2>/dev/null || true)
    if [[ -z "$db_paths" ]]; then
      echo "    No volume mounts found, skipping"
      continue
    fi
    for vol_path in $db_paths; do
      local out="${BACKUP_DIR}/${container}${vol_path//\//_}.sqlite"
      if docker exec "$container" sh -c "[ -f \"${vol_path}/data.db\" ]" 2>/dev/null; then
        docker exec "$container" sh -c "sqlite3 \"${vol_path}/data.db\" .dump" > "$out.dump" 2>/dev/null && echo "    Dumped ${vol_path}/data.db" || echo "    WARN: sqlite3 dump failed for ${vol_path}/data.db"
      fi
      if docker exec "$container" sh -c "[ -f \"${vol_path}/main.db\" ]" 2>/dev/null; then
        docker exec "$container" sh -c "sqlite3 \"${vol_path}/main.db\" .dump" > "$out.dump" 2>/dev/null && echo "    Dumped ${vol_path}/main.db" || echo "    WARN: sqlite3 dump failed for ${vol_path}/main.db"
      fi
    done
  done
  if [[ -z "$(ls -A "$BACKUP_DIR"/*.dump 2>/dev/null)" ]]; then
    echo "  WARN: No database dumps created — are containers running with labels?"
  fi
}

do_volumes() {
  echo "--- Volume backups ---"
  local volumes
  volumes=$(docker volume ls --filter "label=com.worldoffice.volume" --format "{{.Name}}" 2>/dev/null || docker volume ls --format "{{.Name}}" | grep -E "world.office|wo-" || true)
  if [[ -z "$volumes" ]]; then
    echo "  No matching volumes found, trying all labeled volumes..."
    volumes=$(docker volume ls --format "{{.Name}}" 2>/dev/null | head -20 || true)
  fi
  for vol in $volumes; do
    echo "  Volume: $vol"
    local out="${BACKUP_DIR}/${vol}.tar.gz"
    docker run --rm -v "${vol}:/volume" --log-driver=none alpine:3.19 tar czf - -C /volume . > "$out" 2>/dev/null
    echo "    Saved: $(realpath "$out") ($(du -h "$out" | cut -f1))"
  done
}

case "$MODE" in
  database) do_database ;;
  volumes)  do_volumes ;;
  all)      do_database && do_volumes ;;
esac

echo "--- Pruning backups older than ${RETENTION_DAYS} days ---"
find "$BACKUP_ROOT" -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} \; -print 2>/dev/null || true

echo "--- Backup complete ---"
echo "Location: $(realpath "$BACKUP_DIR")"
ls -lh "$BACKUP_DIR"
