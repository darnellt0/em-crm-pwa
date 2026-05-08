#!/bin/bash
# Backup script for Elevated Movements CRM local database

set -e

# Load environment variables from .env.local if it exists
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

# Default to the local docker container name if DATABASE_URL is not set
DB_CONTAINER="em_postgres"
DB_USER="em_app"
DB_NAME="em_crm"

BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/em_crm_backup_$TIMESTAMP.sql"

echo "📦 Starting backup of Elevated Movements CRM database..."

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

# Execute pg_dump inside the container
echo "⏳ Dumping database to $BACKUP_FILE..."
docker exec -t "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -c --if-exists > "$BACKUP_FILE"

# Compress the backup
echo "🗜️ Compressing backup..."
gzip "$BACKUP_FILE"

echo "✅ Backup complete: ${BACKUP_FILE}.gz"
echo "   Keep this file safe!"
