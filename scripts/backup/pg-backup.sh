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

UPLOADS_DIR="${UPLOADS_DIR:-/app/uploads}"

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

# Back up uploaded attachments alongside the DB dump
UPLOADS_ARCHIVE="${BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz"
if [ -d "${UPLOADS_DIR}" ]; then
  tar -czf "${UPLOADS_ARCHIVE}" -C "$(dirname "${UPLOADS_DIR}")" "$(basename "${UPLOADS_DIR}")"
  USIZE=$(du -h "${UPLOADS_ARCHIVE}" | cut -f1)
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Uploads archived — uploads_${TIMESTAMP}.tar.gz (${USIZE})"
else
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] WARN: uploads dir ${UPLOADS_DIR} not found — skipping"
fi

# Remove backups older than RETAIN_DAYS
PRUNED=$(find "${BACKUP_DIR}" -maxdepth 1 \( -name "${PGDATABASE}_*.dump" -o -name "uploads_*.tar.gz" \) \
  -mtime "+${RETAIN_DAYS}" -print -delete | wc -l)
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Pruned ${PRUNED} backup(s) older than ${RETAIN_DAYS} days"
