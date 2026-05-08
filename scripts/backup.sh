#!/bin/bash
set -e

BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/em_crm_backup_$TIMESTAMP.sql"

echo "📦 Backing up database to $BACKUP_FILE..."
docker exec em_postgres pg_dump -U em_app em_crm > "$BACKUP_FILE"

echo "✅ Backup complete!"
