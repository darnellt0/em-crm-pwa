#!/usr/bin/env bash
set -euo pipefail

crm_url="${EM_CRM_URL:-http://100.126.177.82:3001}"
crm_token="${EM_CRM_TOKEN:-}"
secret_file="${EM_CRM_TOKEN_FILE:-$HOME/.openclaw/secrets/em-crm-token.txt}"

if [[ -z "$crm_token" && -r "$secret_file" ]]; then
  crm_token="$(<"$secret_file")"
fi
if [[ -z "$crm_token" ]]; then
  echo "CRM credential is unavailable" >&2
  exit 1
fi

response="$(
  curl --fail --silent --show-error \
    --connect-timeout 5 \
    --max-time 30 \
    --header "x-internal-token: ${crm_token}" \
    "${crm_url%/}/api/internal/ops-summary"
)"

if ! jq -e '.ok == true and .source == "em-crm-pwa"' >/dev/null <<<"$response"; then
  echo "CRM returned an invalid operational summary" >&2
  exit 1
fi

printf '%s\n' "$response"
