#!/bin/bash
# EM CRM — Local Readiness Verification Script
# Run after setup to confirm the CRM is correctly configured.
# Usage: pnpm verify
#
# Exit codes:
#   0 — all required checks passed
#   1 — one or more required checks failed

set -uo pipefail

# ── Load env ──────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$PROJECT_DIR/.env.local" ]; then
  # Export non-comment, non-empty lines from .env.local
  set -a
  # shellcheck disable=SC1090
  source <(grep -v '^\s*#' "$PROJECT_DIR/.env.local" | grep -v '^\s*$')
  set +a
fi

BASE_URL="${NEXTAUTH_URL:-http://localhost:3000}"
DB_CONTAINER="em_postgres"
DB_USER="em_app"
DB_NAME="em_crm"
PASS=0
FAIL=0

pass() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  ⚠️  $1"; }

echo ""
echo "============================================"
echo "  Elevated Movements CRM — Readiness Check"
echo "============================================"
echo ""

# ── 1. Infrastructure ─────────────────────────────────────────────────────────

echo "[ Infrastructure ]"

if docker info > /dev/null 2>&1; then
  pass "Docker is running"
else
  fail "Docker is not running — start Docker Desktop first"
fi

if docker ps --format "{{.Names}}" | grep -q "^${DB_CONTAINER}$"; then
  pass "Database container (${DB_CONTAINER}) is running"
else
  fail "Database container (${DB_CONTAINER}) is not running — run: docker compose up -d"
fi

# ── 2. Database ───────────────────────────────────────────────────────────────

echo ""
echo "[ Database ]"

if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
  pass "Database connection successful"
else
  fail "Cannot connect to database — run: docker compose up -d && pnpm db:push"
fi

VECTOR_CHECK=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT COUNT(*) FROM pg_extension WHERE extname='vector'" 2>/dev/null || echo "0")
if [ "${VECTOR_CHECK:-0}" -ge 1 ] 2>/dev/null; then
  pass "pgvector extension is installed"
else
  fail "pgvector extension is missing — run: pnpm db:push"
fi

USER_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT COUNT(*) FROM \"User\"" 2>/dev/null | tr -d '[:space:]' || echo "0")
if [ "${USER_COUNT:-0}" -ge 1 ] 2>/dev/null; then
  pass "Seed users exist (${USER_COUNT} user(s) in database)"
else
  fail "No users found — run: pnpm db:seed"
fi

# Verify seed users specifically have admin role
ADMIN_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT COUNT(*) FROM \"User\" WHERE role='admin'" 2>/dev/null | tr -d '[:space:]' || echo "0")
if [ "${ADMIN_COUNT:-0}" -ge 1 ] 2>/dev/null; then
  pass "At least one admin user exists (${ADMIN_COUNT} admin(s))"
else
  fail "No admin users found — run: pnpm db:seed"
fi

# ── 3. Prisma client ──────────────────────────────────────────────────────────

echo ""
echo "[ Node / Prisma ]"

cd "$PROJECT_DIR"

if [ -d "node_modules/.prisma/client" ]; then
  pass "Prisma client is generated (node_modules/.prisma/client exists)"
else
  fail "Prisma client not generated — run: pnpm install (postinstall runs prisma generate)"
fi

# ── 4. TypeScript typecheck ───────────────────────────────────────────────────

echo "  ⏳ Running TypeScript typecheck (this may take ~15s)..."
if npx tsc --noEmit > /tmp/em_crm_tsc.log 2>&1; then
  pass "TypeScript typecheck passed"
else
  fail "TypeScript errors found — see /tmp/em_crm_tsc.log for details"
fi

# ── 5. Application ────────────────────────────────────────────────────────────

echo ""
echo "[ Application ]"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/auth/signin" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  pass "App is running at ${BASE_URL}"
else
  fail "App is not responding at ${BASE_URL} (HTTP ${HTTP_STATUS}) — run: pnpm dev"
fi

SIGNIN_BODY=$(curl -s "${BASE_URL}/auth/signin" 2>/dev/null || echo "")
if echo "$SIGNIN_BODY" | grep -q "Elevated Movements"; then
  pass "Sign-in page renders correctly"
else
  fail "Sign-in page does not contain expected content"
fi

# Protected APIs must return 401 (not 200) when unauthenticated
DASHBOARD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/dashboard" 2>/dev/null || echo "000")
if [ "$DASHBOARD_STATUS" = "401" ]; then
  pass "Dashboard API is auth-protected (returns 401 without session)"
else
  fail "Dashboard API returned HTTP ${DASHBOARD_STATUS} — expected 401 (unauthenticated)"
fi

CONTACTS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/contacts" 2>/dev/null || echo "000")
if [ "$CONTACTS_STATUS" = "401" ]; then
  pass "Contacts API is auth-protected (returns 401 without session)"
else
  fail "Contacts API returned HTTP ${CONTACTS_STATUS} — expected 401 (unauthenticated)"
fi

# ── 6. Ollama (optional, non-fatal) ──────────────────────────────────────────

echo ""
echo "[ AI / Ollama (optional) ]"

OLLAMA_BASE="${OLLAMA_URL:-http://127.0.0.1:11434}"
OLLAMA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${OLLAMA_BASE}/api/tags" 2>/dev/null || echo "000")
if [ "$OLLAMA_STATUS" = "200" ]; then
  pass "Ollama is running at ${OLLAMA_BASE}"
else
  warn "Ollama is not running (${OLLAMA_BASE} → HTTP ${OLLAMA_STATUS})"
  echo "       AI memory extraction and semantic search will not work until Ollama is started."
  echo "       This is non-fatal — the rest of the CRM works without it."
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "============================================"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "  ⚠️  Some checks failed. See LOCAL_SETUP.md for troubleshooting."
  exit 1
else
  echo "  🎉 All checks passed! The CRM is ready for use."
  echo "     Sign in at: ${BASE_URL}"
  exit 0
fi
