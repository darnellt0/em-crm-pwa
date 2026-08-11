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
echo "   (Stop the CRM app first so no live connections interfere.)"

# Close lingering app connections so DROP/CREATE statements don't block.
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" > /dev/null

# Determine if file is gzip-compressed
if [[ "$BACKUP_FILE" == *.gz ]]; then
  PIPE_CMD="gunzip -c"
else
  PIPE_CMD="cat"
fi

# ON_ERROR_STOP makes psql exit non-zero on the FIRST failed statement, and
# --single-transaction rolls the whole restore back on failure — without
# these, psql exits 0 even when statements fail and we would falsely report
# success over a partial restore.
if $PIPE_CMD "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" \
    psql -U "$DB_USER" -d "$DB_NAME" -q \
    -v ON_ERROR_STOP=1 --single-transaction; then
  echo "✅ Restore complete! Database '${DB_NAME}' has been restored."
  echo "   Restart the app if it is running: Ctrl+C then pnpm dev"
else
  echo "❌ Restore FAILED and was rolled back — the database is unchanged."
  echo "   Check the error above, or Docker logs: docker logs ${DB_CONTAINER}"
  exit 1
fi
