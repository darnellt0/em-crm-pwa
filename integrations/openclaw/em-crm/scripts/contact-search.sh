#!/usr/bin/env bash
set -euo pipefail

query="${1:?usage: contact-search.sh QUERY}"
crm_url="${EM_CRM_URL:-http://100.126.177.82:3001}"
token="${EM_CRM_TOKEN:-}"
token_file="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/secrets/em-crm-token.txt"

if [[ -z "$token" && -r "$token_file" ]]; then
  token="$(<"$token_file")"
fi
if [[ -z "$token" ]]; then
  echo "EM_CRM_TOKEN is not available" >&2
  exit 1
fi

curl --fail-with-body --silent --show-error --max-time 15 \
  --get \
  --header "x-internal-token: $token" \
  --data-urlencode "q=$query" \
  "$crm_url/api/internal/contacts/search"
