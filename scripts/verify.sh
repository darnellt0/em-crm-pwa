#!/bin/bash
# Local acceptance verification script for Elevated Movements CRM
# Run this after setup to confirm the app is working correctly.

set -e

# Load .env.local if available
if [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | xargs)
fi

BASE_URL="${AUTH_URL:-http://localhost:3000}"
DB_CONTAINER="em_postgres"
DB_USER="em_app"
DB_NAME="em_crm"
PASS=0
FAIL=0

pass() { echo "  ✅ $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo ""
echo "============================================"
echo "  Elevated Movements CRM — Acceptance Check"
echo "============================================"
echo ""

# 1. Docker running
echo "[ Infrastructure ]"
if docker info > /dev/null 2>&1; then
  pass "Docker is running"
else
  fail "Docker is not running"
fi

# 2. Database container running
if docker ps | grep -q "$DB_CONTAINER"; then
  pass "Database container ($DB_CONTAINER) is running"
else
  fail "Database container ($DB_CONTAINER) is not running"
fi

# 3. Database connects and migrations applied
echo ""
echo "[ Database ]"
if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
  pass "Database connection successful"
else
  fail "Cannot connect to database"
fi

# 4. pgvector extension exists
if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT extname FROM pg_extension WHERE extname='vector'" | grep -q "vector"; then
  pass "pgvector extension is installed"
else
  fail "pgvector extension is missing — run: pnpm db:push"
fi

# 5. User table exists and has rows (seed ran)
USER_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM \"User\"" 2>/dev/null | tr -d ' ')
if [ "$USER_COUNT" -ge 1 ] 2>/dev/null; then
  pass "User table has $USER_COUNT user(s) — seed ran"
else
  fail "User table is empty — run: pnpm db:seed"
fi

# 6. App is running
echo ""
echo "[ Application ]"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/auth/signin" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  pass "App is running at $BASE_URL"
else
  fail "App is not responding at $BASE_URL (HTTP $HTTP_STATUS) — run: pnpm dev"
fi

# 7. Dashboard API responds
DASHBOARD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/dashboard" 2>/dev/null || echo "000")
if [ "$DASHBOARD_STATUS" = "401" ] || [ "$DASHBOARD_STATUS" = "200" ]; then
  pass "Dashboard API is reachable (HTTP $DASHBOARD_STATUS)"
else
  fail "Dashboard API is not responding (HTTP $DASHBOARD_STATUS)"
fi

# 8. Contacts API responds
CONTACTS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/contacts" 2>/dev/null || echo "000")
if [ "$CONTACTS_STATUS" = "401" ] || [ "$CONTACTS_STATUS" = "200" ]; then
  pass "Contacts API is reachable (HTTP $CONTACTS_STATUS)"
else
  fail "Contacts API is not responding (HTTP $CONTACTS_STATUS)"
fi

# 9. Auth config loads (sign-in page renders)
SIGNIN_BODY=$(curl -s "$BASE_URL/auth/signin" 2>/dev/null || echo "")
if echo "$SIGNIN_BODY" | grep -q "Elevated Movements"; then
  pass "Sign-in page renders correctly"
else
  fail "Sign-in page does not render correctly"
fi

# 10. Ollama (optional)
echo ""
echo "[ AI / Ollama (optional) ]"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
OLLAMA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$OLLAMA_URL/api/tags" 2>/dev/null || echo "000")
if [ "$OLLAMA_STATUS" = "200" ]; then
  pass "Ollama is running at $OLLAMA_URL"
else
  echo "  ⚠️  Ollama is not running (HTTP $OLLAMA_STATUS) — AI memory extraction will be skipped"
fi

echo ""
echo "============================================"
echo "  Results: $PASS passed, $FAIL failed"
echo "============================================"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  Some checks failed. See LOCAL_SETUP.md for troubleshooting."
  exit 1
else
  echo "  All checks passed! The CRM is ready for use."
  exit 0
fi
