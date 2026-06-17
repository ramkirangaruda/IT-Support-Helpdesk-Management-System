#!/usr/bin/env bash
# pg-backup.sh — nightly Postgres backup for TicketZilla
#
# Usage (manual): ./scripts/backup/pg-backup.sh
# Usage (Docker service): see docker-compose.prod.yml backup service
#
# Environment variables (inherit from .env or set explicitly):
#   PGHOST     — Postgres host  (default: postgres)
#   PGPORT     — Postgres port  (default: 5432)
#   PGUSER     — Postgres user  (default: postgres)
#   PGPASSWORD — Postgres password (required)
#   PGDATABASE — Database name  (default: ticketzilla)
#   BACKUP_DIR — Output directory (default: /backups)
#   RETAIN_DAYS — Days of backups to keep (default: 14)
#
# Restore: pg_restore -U $PGUSER -d $PGDATABASE /backups/<file>.dump

set -euo pipefail

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-ticketzilla}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${PGDATABASE}_${TIMESTAMP}.dump"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting backup → ${FILEPATH}"

pg_dump \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --dbname="${PGDATABASE}" \
  --format=custom \
  --compress=9 \
  --no-privileges \
  --no-owner \
  --file="${FILEPATH}"

SIZE=$(du -h "${FILEPATH}" | cut -f1)
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup complete — ${FILENAME} (${SIZE})"

# Remove backups older than RETAIN_DAYS
PRUNED=$(find "${BACKUP_DIR}" -maxdepth 1 -name "${PGDATABASE}_*.dump" \
  -mtime "+${RETAIN_DAYS}" -print -delete | wc -l)
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Pruned ${PRUNED} backup(s) older than ${RETAIN_DAYS} days"
