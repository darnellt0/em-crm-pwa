#!/bin/bash
# EM CRM — Database Restore Script
# Restores a pg_dump backup (.sql or .sql.gz) into the local PostgreSQL database.
# Usage: pnpm restore:db ./backups/em_crm_backup_YYYYMMDD_HHMMSS.sql.gz
set -euo pipefail

DB_CONTAINER="em_postgres"
DB_USER="em_app"
DB_NAME="em_crm"

# ── Argument check ────────────────────────────────────────────────────────────

if [ -z "${1:-}" ]; then
  echo "❌ Error: No backup file specified."
  echo ""
  echo "Usage: pnpm restore:db ./backups/em_crm_backup_YYYYMMDD_HHMMSS.sql.gz"
  echo "       pnpm restore:db ./backups/em_crm_backup_YYYYMMDD_HHMMSS.sql"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: File not found: ${BACKUP_FILE}"
  exit 1
fi

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

# ── Confirm overwrite ─────────────────────────────────────────────────────────

echo ""
echo "⚠️  WARNING: This will OVERWRITE the current '${DB_NAME}' database."
echo "   Backup file: ${BACKUP_FILE}"
echo ""
read -r -p "   Type 'yes' to confirm: " CONFIRM
echo ""

if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled."
  exit 0
fi

# ── Run restore ───────────────────────────────────────────────────────────────

echo "🔄 Restoring ${DB_NAME} from ${BACKUP_FILE} ..."

# Determine if file is gzip-compressed
if [[ "$BACKUP_FILE" == *.gz ]]; then
  PIPE_CMD="gunzip -c"
else
  PIPE_CMD="cat"
fi

if $PIPE_CMD "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" \
    psql -U "$DB_USER" -d "$DB_NAME" -q; then
  echo "✅ Restore complete! Database '${DB_NAME}' has been restored."
  echo "   Restart the app if it is running: Ctrl+C then pnpm dev"
else
  echo "❌ Restore failed. The database may be in a partial state."
  echo "   Check Docker logs: docker logs ${DB_CONTAINER}"
  exit 1
fi
