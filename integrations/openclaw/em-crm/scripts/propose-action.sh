#!/usr/bin/env bash
set -euo pipefail

idempotency_key="${1:?usage: propose-action.sh IDEMPOTENCY_KEY RATIONALE}"
rationale="${2:?usage: propose-action.sh IDEMPOTENCY_KEY RATIONALE}"
crm_url="${EM_CRM_URL:-http://100.126.177.82:3001}"
token="${EM_CRM_WRITE_TOKEN:-}"
token_file="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/secrets/em-crm-write-token.txt"

if [[ -z "$token" && -r "$token_file" ]]; then
  token="$(<"$token_file")"
fi
if [[ -z "$token" ]]; then
  echo "CRM proposal access is not configured" >&2
  exit 1
fi

action="$(cat)"
if ! jq -e 'type == "object" and (.actionType | type == "string")' <<<"$action" >/dev/null; then
  echo "stdin must contain one JSON action object" >&2
  exit 1
fi

body="$(jq -cn \
  --arg idempotencyKey "$idempotency_key" \
  --arg rationale "$rationale" \
  --argjson action "$action" \
  '{agentId:"openclaw:nia", $idempotencyKey, $rationale, $action}')"

curl --fail-with-body --silent --show-error --max-time 15 \
  --request POST \
  --header "Content-Type: application/json" \
  --header "x-agent-write-token: $token" \
  --data "$body" \
  "$crm_url/api/internal/agent-actions"
