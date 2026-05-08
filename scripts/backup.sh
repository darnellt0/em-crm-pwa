#!/bin/bash
# EM CRM — Database Backup Script
# Creates a compressed pg_dump of the local PostgreSQL database.
# Usage: pnpm backup:db
set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
DB_CONTAINER="em_postgres"
DB_USER="em_app"
DB_NAME="em_crm"

# ── Pre-flight checks ─────────────────────────────────────────────────────────

if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Start Docker Desktop and try again."
  exit 1
fi

if ! docker ps --format "{{.Names}}" | grep -q "^${DB_CONTAINER}$"; then
  echo "❌ Container '${DB_CONTAINER}' is not running."
  echo "   Run: docker compose up -d"
  exit 1
fi

# ── Run backup ────────────────────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/em_crm_backup_${TIMESTAMP}.sql.gz"

echo "📦 Backing up ${DB_NAME} → ${BACKUP_FILE} ..."

if docker exec "$DB_CONTAINER" \
    pg_dump -U "$DB_USER" \
    --clean --if-exists \
    --no-owner --no-acl \
    "$DB_NAME" \
    | gzip > "$BACKUP_FILE"; then
  SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
  echo "✅ Backup complete! File: ${BACKUP_FILE} (${SIZE})"
else
  echo "❌ Backup failed. Check Docker logs: docker logs ${DB_CONTAINER}"
  rm -f "$BACKUP_FILE"
  exit 1
fi
