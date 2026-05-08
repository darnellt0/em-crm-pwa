#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "❌ Error: Please provide the path to the backup file."
  echo "Usage: pnpm restore:db ./backups/em_crm_backup_YYYYMMDD_HHMMSS.sql"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: File $BACKUP_FILE not found."
  exit 1
fi

echo "⚠️ WARNING: This will overwrite the current database."
read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Restore cancelled."
  exit 1
fi

echo "🔄 Restoring database from $BACKUP_FILE..."
cat "$BACKUP_FILE" | docker exec -i em_postgres psql -U em_app -d em_crm

echo "✅ Restore complete!"
