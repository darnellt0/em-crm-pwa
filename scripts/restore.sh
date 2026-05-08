#!/bin/bash
# Restore script for Elevated Movements CRM local database

set -e

if [ -z "$1" ]; then
  echo "❌ Error: Please provide the path to the backup file."
  echo "Usage: pnpm restore:db ./backups/em_crm_backup_YYYYMMDD_HHMMSS.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Error: Backup file '$BACKUP_FILE' not found."
  exit 1
fi

# Default to the local docker container name
DB_CONTAINER="em_postgres"
DB_USER="em_app"
DB_NAME="em_crm"

echo "⚠️ WARNING: This will OVERWRITE the current database with the backup."
read -p "Are you sure you want to continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Restore cancelled."
  exit 1
fi

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Error: Docker is not running. Please start Docker Desktop."
  exit 1
fi

# Check if the database container is running
if ! docker ps | grep -q "$DB_CONTAINER"; then
  echo "❌ Error: Database container '$DB_CONTAINER' is not running."
  echo "   Run 'docker compose up -d' first."
  exit 1
fi

echo "⏳ Restoring database from $BACKUP_FILE..."

if [[ "$BACKUP_FILE" == *.gz ]]; then
  # Decompress and pipe to psql
  gunzip -c "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
else
  # Pipe directly to psql
  cat "$BACKUP_FILE" | docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
fi

echo "✅ Restore complete!"
echo "   You may need to restart the Next.js app to clear any cached data."
