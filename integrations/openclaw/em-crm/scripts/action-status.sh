#!/usr/bin/env bash
set -euo pipefail

action_id="${1:?usage: action-status.sh ACTION_UUID}"
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

curl --fail-with-body --silent --show-error --max-time 15 \
  --get \
  --header "x-agent-write-token: $token" \
  --data-urlencode "id=$action_id" \
  "$crm_url/api/internal/agent-actions"
